import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  TextChannel,
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
  saveSession(session);
  await updateSessionMessage(session, guild);
  await interaction.deferUpdate();
}

async function terminateSession(
  interaction: ButtonInteraction,
  session: NaejeonSession,
  guild: Guild | null,
  state: "cancelled" | "ended"
): Promise<void> {
  session.state = state;
  await updateSessionMessage(session, guild);
  deleteSession(session.id);
  await interaction.deferUpdate();
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
    await interaction.reply({
      content: "채널을 찾을 수 없습니다.",
      ephemeral: true,
    });
    return;
  }

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

  await interaction.deferUpdate();
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

function canActForCurrentCaptain(
  session: NaejeonSession,
  userId: string
): boolean {
  const currentCaptain = session.pickOrder[session.currentPickerIndex];
  return userId === currentCaptain || userId === session.hostId;
}

function startDraft(session: NaejeonSession): void {
  session.state = "drafting";
  session.currentPickerIndex = 0;
  session.draftSelections = [];
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
  const [c1, c2] = session.captains;
  session.redTeamCaptainId = Math.random() < 0.5 ? c1 : c2;
}

export async function handleNaejeonCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
      ephemeral: true,
    });
    return;
  }

  const existing = getActiveSessionByChannel(interaction.channelId);
  if (existing && isActiveState(existing.state)) {
    await interaction.reply({
      content: "이 채널에 이미 진행 중인 내전이 있습니다.",
      ephemeral: true,
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
      ephemeral: true,
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
          ephemeral: true,
        });
        return;
      }
      if (session.participants.includes(userId)) {
        await interaction.reply({
          content: "이미 참가 신청하셨습니다.",
          ephemeral: true,
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
          ephemeral: true,
        });
        return;
      }
      if (!session.participants.includes(userId)) {
        await interaction.reply({
          content: "참가 신청하지 않으셨습니다.",
          ephemeral: true,
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
          ephemeral: true,
        });
        return;
      }
      if (session.participants.length < 2) {
        await interaction.reply({
          content: "최소 2명 이상 참가해야 내전을 시작할 수 있습니다.",
          ephemeral: true,
        });
        return;
      }
      session.state = "selecting_captains";
      session.captainCandidates = [];
      await refresh(interaction, session, guild);
      return;

    case "captain":
      if (session.state !== "selecting_captains") {
        await interaction.reply({
          content: "현재 팀장 선택 단계가 아닙니다.",
          ephemeral: true,
        });
        return;
      }
      if (userId !== session.hostId) {
        await interaction.reply({
          content: "팀장 선택은 내전을 연 호스트만 할 수 있습니다.",
          ephemeral: true,
        });
        return;
      }
      if (!payload || !session.participants.includes(payload)) {
        await interaction.reply({
          content: "유효하지 않은 참가자입니다.",
          ephemeral: true,
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
            ephemeral: true,
          });
          return;
        } else {
          session.captainCandidates.push(payload);
        }
      }
      await refresh(interaction, session, guild);
      return;

    case "confirm_captains":
      if (session.state !== "selecting_captains") {
        await interaction.reply({
          content: "현재 팀장 선택 단계가 아닙니다.",
          ephemeral: true,
        });
        return;
      }
      if (userId !== session.hostId) {
        await interaction.reply({
          content: "팀장 확정은 내전을 연 호스트만 할 수 있습니다.",
          ephemeral: true,
        });
        return;
      }
      if (session.captainCandidates.length !== 2) {
        await interaction.reply({
          content: "팀장 2명을 선택해주세요.",
          ephemeral: true,
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
          ephemeral: true,
        });
        return;
      }
      {
        const currentCaptain = session.pickOrder[session.currentPickerIndex];
        if (!canActForCurrentCaptain(session, userId)) {
          await interaction.reply({
            content: `<@${currentCaptain}> 팀장님 또는 호스트 <@${session.hostId}>만 진행할 수 있습니다.`,
            ephemeral: true,
          });
          return;
        }
        if (!payload || !session.remaining.includes(payload)) {
          await interaction.reply({
            content: "선택할 수 없는 플레이어입니다.",
            ephemeral: true,
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
          ephemeral: true,
        });
        return;
      }
      {
        const currentCaptain = session.pickOrder[session.currentPickerIndex];
        if (!canActForCurrentCaptain(session, userId)) {
          await interaction.reply({
            content: `<@${currentCaptain}> 팀장님 또는 호스트 <@${session.hostId}>만 진행할 수 있습니다.`,
            ephemeral: true,
          });
          return;
        }
        if (session.draftSelections.length === 0) {
          await interaction.reply({
            content: "뽑기 전에 후보를 한 명 이상 선택해주세요.",
            ephemeral: true,
          });
          return;
        }
        const pickIndex = Math.floor(
          Math.random() * session.draftSelections.length
        );
        const pickedId = session.draftSelections[pickIndex];
        session.teams[currentCaptain].push(pickedId);
        session.remaining = session.remaining.filter((id) => id !== pickedId);
        advanceAfterPick(session);
      }
      await refresh(interaction, session, guild);
      return;

    case "cancel":
      if (session.state === "cancelled" || session.state === "ended") {
        await interaction.reply({
          content: "이미 종료된 내전입니다.",
          ephemeral: true,
        });
        return;
      }
      if (session.state === "complete") {
        await interaction.reply({
          content: "팀 구성이 완료된 내전은 **내전 종료** 버튼을 사용해주세요.",
          ephemeral: true,
        });
        return;
      }
      if (userId !== session.hostId) {
        await interaction.reply({
          content: `내전 취소는 <@${session.hostId}> 호스트만 할 수 있습니다.`,
          ephemeral: true,
        });
        return;
      }
      await terminateSession(interaction, session, guild, "cancelled");
      return;

    case "end":
      if (session.state === "cancelled" || session.state === "ended") {
        await interaction.reply({
          content: "이미 종료된 내전입니다.",
          ephemeral: true,
        });
        return;
      }
      if (session.state !== "complete") {
        await interaction.reply({
          content: "팀 구성이 완료된 후 **내전 종료**를 할 수 있습니다.",
          ephemeral: true,
        });
        return;
      }
      if (userId !== session.hostId) {
        await interaction.reply({
          content: `내전 종료는 <@${session.hostId}> 호스트만 할 수 있습니다.`,
          ephemeral: true,
        });
        return;
      }
      await terminateSession(interaction, session, guild, "ended");
      return;

    case "rematch":
      if (session.state !== "complete") {
        await interaction.reply({
          content: "팀 구성 완료 후 **재경기**를 할 수 있습니다.",
          ephemeral: true,
        });
        return;
      }
      if (userId !== session.hostId) {
        await interaction.reply({
          content: `재경기는 <@${session.hostId}> 호스트만 시작할 수 있습니다.`,
          ephemeral: true,
        });
        return;
      }
      if (session.participants.length < 2) {
        await interaction.reply({
          content: "재경기를 하려면 최소 2명 이상의 참가자가 필요합니다.",
          ephemeral: true,
        });
        return;
      }
      await startRematchAsNewMessage(interaction, session, guild);
      return;
  }
}
