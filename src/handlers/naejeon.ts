import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  type Interaction,
  type InteractionReplyOptions,
} from "discord.js";
import {
  createSessionId,
  deleteSession,
  getActiveSessionByChannel,
  getSession,
  saveSession,
} from "../session-store";
import { buildMessagePayload } from "../ui";
import { createSession, resetForRematch, rollPickOrder } from "../types";
import type { NaejeonSession } from "../types";

function ephemeral(content: string): InteractionReplyOptions {
  return { content, flags: MessageFlags.Ephemeral };
}

async function updateSessionMessage(
  session: NaejeonSession,
  guild: Guild | null
): Promise<void> {
  const channel = guild?.channels.cache.get(session.channelId) as
    | TextChannel
    | undefined;
  if (!channel) return;

  const message = await channel.messages
    .fetch(session.messageId)
    .catch(() => null);
  if (!message) return;

  const payload = await buildMessagePayload(session, guild);
  await message.edit(payload);
}

async function refresh(
  interaction: ButtonInteraction,
  session: NaejeonSession,
  guild: Guild | null
): Promise<void> {
  await interaction.deferUpdate();
  saveSession(session);
  await updateSessionMessage(session, guild);
}

async function terminateSession(
  interaction: ButtonInteraction,
  session: NaejeonSession,
  guild: Guild | null,
  state: "cancelled" | "ended"
): Promise<void> {
  await interaction.deferUpdate();
  session.state = state;
  await updateSessionMessage(session, guild);
  deleteSession(session.id);
}

async function continueAsNewMessage(
  interaction: ButtonInteraction,
  session: NaejeonSession,
  guild: Guild | null,
  oldMessageNote: string
): Promise<void> {
  const channel = guild?.channels.cache.get(session.channelId) as
    | TextChannel
    | undefined;
  if (!channel) {
    await interaction.reply(ephemeral("채널을 찾을 수 없습니다."));
    return;
  }

  await interaction.deferUpdate();

  const oldMessage = await channel.messages
    .fetch(session.messageId)
    .catch(() => null);

  const payload = await buildMessagePayload(session, guild);
  const newMessage = await channel.send(payload);

  session.messageId = newMessage.id;
  saveSession(session);

  if (oldMessage?.embeds[0]) {
    const embed = EmbedBuilder.from(oldMessage.embeds[0]);
    const prevDesc = oldMessage.embeds[0].description ?? "";
    embed.setDescription(`${prevDesc}\n\n↘️ ${oldMessageNote}`);
    await oldMessage.edit({ embeds: [embed], components: [] });
  }
}

async function startRematchAsNewMessage(
  interaction: ButtonInteraction,
  session: NaejeonSession,
  guild: Guild | null
): Promise<void> {
  resetForRematch(session);
  await continueAsNewMessage(
    interaction,
    session,
    guild,
    "**재경기**가 아래에서 시작되었습니다."
  );
}

function isActiveState(state: NaejeonSession["state"]): boolean {
  return !["complete", "cancelled", "ended"].includes(state);
}

function isServerAdmin(
  interaction: Interaction
): interaction is Interaction & {
  memberPermissions: NonNullable<Interaction["memberPermissions"]>;
} {
  if (!interaction.inGuild()) return false;
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

function canActAsHost(
  session: NaejeonSession,
  userId: string,
  interaction: Interaction
): boolean {
  return userId === session.hostId || isServerAdmin(interaction);
}

function canActForCurrentCaptain(
  session: NaejeonSession,
  userId: string,
  interaction: Interaction
): boolean {
  const currentCaptain = session.pickOrder[session.currentPickerIndex];
  return (
    userId === currentCaptain ||
    userId === session.hostId ||
    isServerAdmin(interaction)
  );
}

function startDraft(session: NaejeonSession): void {
  session.state = "drafting";
  session.currentPickerIndex = 0;
  session.draftSelections = [];
  session.kickMode = false;
  session.kickSelections = [];
  const [c1, c2] = session.captains;
  session.teams = { [c1]: [], [c2]: [] };
  session.remaining = session.participants.filter(
    (id) => !session.captains.includes(id)
  );
}

function advanceAfterPick(session: NaejeonSession): void {
  session.draftSelections = [];

  if (session.remaining.length === 0) {
    finishDraft(session);
    return;
  }

  session.currentPickerIndex =
    (session.currentPickerIndex + 1) % session.pickOrder.length;
}

function finishDraft(session: NaejeonSession): void {
  session.state = "complete";
  session.kickMode = false;
  session.kickSelections = [];
  const [c1, c2] = session.captains;
  session.redTeamCaptainId = Math.random() < 0.5 ? c1 : c2;
}

function expelParticipants(session: NaejeonSession, userIds: string[]): void {
  session.participants = session.participants.filter(
    (id) => !userIds.includes(id)
  );
  session.captainCandidates = session.captainCandidates.filter(
    (id) => !userIds.includes(id)
  );
  session.kickSelections = session.kickSelections.filter(
    (id) => !userIds.includes(id)
  );
}

export async function handleNaejeonCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existing = getActiveSessionByChannel(interaction.channelId);
  if (existing && isActiveState(existing.state)) {
    await interaction.reply({
      content: "이 채널에 이미 진행 중인 내전이 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (existing && ["complete", "cancelled", "ended"].includes(existing.state)) {
    deleteSession(existing.id);
  }

  await interaction.deferReply();

  const sessionId = createSessionId();
  const session = createSession(
    sessionId,
    interaction.channelId,
    "",
    interaction.user.id
  );

  const payload = await buildMessagePayload(session, interaction.guild);
  const message = await interaction.editReply(payload);
  if (!message) return;

  session.messageId = message.id;
  saveSession(session);
}

export async function handleHostChangeCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = getActiveSessionByChannel(interaction.channelId);
  if (
    !session ||
    session.state === "cancelled" ||
    session.state === "ended"
  ) {
    await interaction.reply({
      content: "이 채널에 진행 중인 내전이 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userId = interaction.user.id;
  if (!canActAsHost(session, userId, interaction)) {
    await interaction.reply({
      content: `호스트 변경은 <@${session.hostId}> 또는 **서버 관리자**만 할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const newHost = interaction.options.getUser("호스트", true);
  if (newHost.bot) {
    await interaction.reply({
      content: "봇은 호스트가 될 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (newHost.id === session.hostId) {
    await interaction.reply({
      content: `<@${newHost.id}>님이 이미 호스트입니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const oldHostId = session.hostId;
  session.hostId = newHost.id;
  saveSession(session);
  await updateSessionMessage(session, interaction.guild);

  await interaction.reply({
    content: `호스트가 <@${oldHostId}> → <@${newHost.id}> 로 변경되었습니다.`,
    flags: MessageFlags.Ephemeral,
  });
}

function canAddParticipants(session: NaejeonSession): boolean {
  return session.state === "registering" || session.state === "selecting_captains";
}

export async function handleAddParticipantCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = getActiveSessionByChannel(interaction.channelId);
  if (
    !session ||
    session.state === "cancelled" ||
    session.state === "ended"
  ) {
    await interaction.reply({
      content: "이 채널에 진행 중인 내전이 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canAddParticipants(session)) {
    await interaction.reply({
      content: "참가자 추가는 **모집** 또는 **팀장 선정** 단계에서만 가능합니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const userId = interaction.user.id;
  if (!canActAsHost(session, userId, interaction)) {
    await interaction.reply({
      content: `참가자 추가는 <@${session.hostId}> 또는 **서버 관리자**만 할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("참가자", true);
  if (target.bot) {
    await interaction.reply({
      content: "봇은 참가자로 추가할 수 없습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (session.participants.includes(target.id)) {
    await interaction.reply({
      content: `<@${target.id}>님은 이미 참가자입니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  session.participants.push(target.id);
  saveSession(session);
  await updateSessionMessage(session, interaction.guild);

  await interaction.reply({
    content: `<@${target.id}>님을 참가자로 추가했습니다. (현재 ${session.participants.length}명)`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleNaejeonButton(
  interaction: ButtonInteraction
): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts.length < 3 || parts[0] !== "nj") return;

  const sessionId = parts[1];
  const action = parts[2];
  const payload = parts[3];

  const session = getSession(sessionId);
  if (!session) {
    await interaction.reply({
      content:
        "내전 세션이 만료되었습니다. 봇이 재시작되었거나 **오래된 메시지**일 수 있습니다.\n" +
        "해당 메시지 대신 **`/내전`을 다시 입력**해 새로 시작해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  const userId = interaction.user.id;

  const canAdjustParticipants =
    session.state === "registering" ||
    (session.state === "selecting_captains" && session.isRematch);

  switch (action) {
    case "join":
      if (!canAdjustParticipants) {
        await interaction.reply({
          content: "현재 참가 신청을 받지 않습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.participants.includes(userId)) {
        await interaction.reply({
          content: "이미 참가 신청하셨습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.participants.push(userId);
      await refresh(interaction, session, guild);
      return;

    case "leave":
      if (!canAdjustParticipants) {
        await interaction.reply({
          content: "현재 참가 취소를 할 수 없습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!session.participants.includes(userId)) {
        await interaction.reply({
          content: "참가 신청하지 않으셨습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.participants = session.participants.filter((id) => id !== userId);
      session.captainCandidates = session.captainCandidates.filter(
        (id) => id !== userId
      );
      await refresh(interaction, session, guild);
      return;

    case "close":
      if (session.state !== "registering") {
        await interaction.reply({
          content: "이미 마감되었습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.participants.length < 2) {
        await interaction.reply({
          content: "최소 2명 이상 참가해야 내전을 시작할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.state = "selecting_captains";
      session.captainCandidates = [];
      session.kickMode = false;
      session.kickSelections = [];
      await continueAsNewMessage(
        interaction,
        session,
        guild,
        "**팀장 선정**이 아래에서 시작되었습니다."
      );
      return;

    case "repost":
      if (session.state !== "registering") {
        await interaction.reply({
          content: "모집 단계에서만 사용할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: "맨 아래로 보내기는 호스트 또는 **서버 관리자**만 사용할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await continueAsNewMessage(
        interaction,
        session,
        guild,
        "**모집**이 아래에서 계속됩니다."
      );
      return;

    case "captain":
      if (session.state !== "selecting_captains" || session.kickMode) {
        await interaction.reply({
          content: session.kickMode
            ? "보내기 모드입니다. **팀장선택으로** 버튼을 눌러주세요."
            : "현재 팀장 선택 단계가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!payload || !session.participants.includes(payload)) {
        await interaction.reply({
          content: "유효하지 않은 참가자입니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      {
        const idx = session.captainCandidates.indexOf(payload);
        if (idx >= 0) {
          session.captainCandidates.splice(idx, 1);
        } else if (session.captainCandidates.length >= 2) {
          await interaction.reply({
            content: "팀장은 2명까지만 선택할 수 있습니다.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        } else {
          session.captainCandidates.push(payload);
        }
      }
      await refresh(interaction, session, guild);
      return;

    case "confirm_captains":
      if (session.state !== "selecting_captains" || session.kickMode) {
        await interaction.reply({
          content: session.kickMode
            ? "보내기 모드입니다. **팀장선택으로** 버튼을 눌러주세요."
            : "현재 팀장 선택 단계가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.captainCandidates.length !== 2) {
        await interaction.reply({
          content: "팀장 2명을 선택해주세요.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.captains = [...session.captainCandidates];
      rollPickOrder(session);
      startDraft(session);
      await continueAsNewMessage(
        interaction,
        session,
        guild,
        "**팀원 선택**이 아래에서 시작되었습니다."
      );
      return;

    case "draft_select":
      if (session.state !== "drafting") {
        await interaction.reply({
          content: "현재 드래프트 단계가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      {
        const currentCaptain = session.pickOrder[session.currentPickerIndex];
        if (!canActForCurrentCaptain(session, userId, interaction)) {
          await interaction.reply({
            content: `<@${currentCaptain}> 팀장님, 호스트 <@${session.hostId}>, 또는 **서버 관리자**만 진행할 수 있습니다.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (!payload || !session.remaining.includes(payload)) {
          await interaction.reply({
            content: "선택할 수 없는 플레이어입니다.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const idx = session.draftSelections.indexOf(payload);
        if (idx >= 0) {
          session.draftSelections.splice(idx, 1);
        } else {
          session.draftSelections.push(payload);
        }
      }
      await refresh(interaction, session, guild);
      return;

    case "draft_pick":
      if (session.state !== "drafting") {
        await interaction.reply({
          content: "현재 드래프트 단계가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      {
        const currentCaptain = session.pickOrder[session.currentPickerIndex];
        if (!canActForCurrentCaptain(session, userId, interaction)) {
          await interaction.reply({
            content: `<@${currentCaptain}> 팀장님, 호스트 <@${session.hostId}>, 또는 **서버 관리자**만 진행할 수 있습니다.`,
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        if (session.draftSelections.length === 0) {
          await interaction.reply({
            content: "뽑기 전에 후보를 한 명 이상 선택해주세요.",
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        const pickedIds = [...session.draftSelections];
        session.teams[currentCaptain].push(...pickedIds);
        session.remaining = session.remaining.filter(
          (id) => !pickedIds.includes(id)
        );
        advanceAfterPick(session);
      }
      await refresh(interaction, session, guild);
      return;

    case "kick_mode":
      if (session.state !== "selecting_captains") {
        await interaction.reply({
          content: "팀장 선택 단계에서만 보내기를 사용할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: "보내기는 호스트 또는 **서버 관리자**만 사용할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.kickMode = true;
      session.captainCandidates = [];
      session.kickSelections = [];
      await refresh(interaction, session, guild);
      return;

    case "captain_mode":
      if (session.state !== "selecting_captains") {
        await interaction.reply({
          content: "현재 팀장 선택 단계가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: "호스트 또는 **서버 관리자**만 전환할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.kickMode = false;
      session.kickSelections = [];
      await refresh(interaction, session, guild);
      return;

    case "kick_select":
      if (session.state !== "selecting_captains" || !session.kickMode) {
        await interaction.reply({
          content: "보내기 모드가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: "보내기는 호스트 또는 **서버 관리자**만 사용할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!payload || !session.participants.includes(payload)) {
        await interaction.reply({
          content: "보낼 수 없는 플레이어입니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      {
        const idx = session.kickSelections.indexOf(payload);
        if (idx >= 0) {
          session.kickSelections.splice(idx, 1);
        } else {
          session.kickSelections.push(payload);
        }
      }
      await refresh(interaction, session, guild);
      return;

    case "kick_confirm":
      if (session.state !== "selecting_captains" || !session.kickMode) {
        await interaction.reply({
          content: "보내기 모드가 아닙니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: "보내기는 호스트 또는 **서버 관리자**만 사용할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.kickSelections.length === 0) {
        await interaction.reply({
          content: "보내기 전에 대상을 한 명 이상 선택해주세요.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (
        session.participants.length - session.kickSelections.length < 2
      ) {
        await interaction.reply({
          content: "보내기 후에도 최소 2명 이상 남아야 합니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      expelParticipants(session, [...session.kickSelections]);
      session.kickMode = false;
      session.kickSelections = [];
      await refresh(interaction, session, guild);
      return;

    case "cancel":
      if (session.state === "cancelled" || session.state === "ended") {
        await interaction.reply({
          content: "이미 종료된 내전입니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.state === "complete") {
        await interaction.reply({
          content: "팀 구성이 완료된 내전은 **내전 종료** 버튼을 사용해주세요.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: `내전 취소는 <@${session.hostId}> 호스트 또는 **서버 관리자**만 할 수 있습니다.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await terminateSession(interaction, session, guild, "cancelled");
      return;

    case "end":
      if (session.state === "cancelled" || session.state === "ended") {
        await interaction.reply({
          content: "이미 종료된 내전입니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.state !== "complete") {
        await interaction.reply({
          content: "팀 구성이 완료된 후 **내전 종료**를 할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canActAsHost(session, userId, interaction)) {
        await interaction.reply({
          content: `내전 종료는 <@${session.hostId}> 호스트 또는 **서버 관리자**만 할 수 있습니다.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await terminateSession(interaction, session, guild, "ended");
      return;

    case "rematch":
      if (session.state !== "complete") {
        await interaction.reply({
          content: "팀 구성 완료 후 **재경기**를 할 수 있습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.participants.length < 2) {
        await interaction.reply({
          content: "재경기를 하려면 최소 2명 이상의 참가자가 필요합니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await startRematchAsNewMessage(interaction, session, guild);
      return;
  }
}
