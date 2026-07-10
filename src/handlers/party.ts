import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
  Guild,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
  type Interaction,
} from "discord.js";
import {
  createPartySessionId,
  deleteParty,
  getActivePartiesByGuild,
  getParty,
  saveParty,
} from "../party-store";
import {
  buildPartyMessagePayload,
  getPartyAutocompleteChoices,
} from "../party-ui";
import { createPartySession, type PartySession } from "../party-types";

function isServerAdmin(interaction: Interaction): boolean {
  if (!interaction.inGuild()) return false;
  const perms = interaction.memberPermissions;
  if (!perms) return false;
  return (
    perms.has(PermissionFlagsBits.Administrator) ||
    perms.has(PermissionFlagsBits.ManageGuild)
  );
}

function canManageParty(
  session: PartySession,
  userId: string,
  interaction: Interaction
): boolean {
  return userId === session.hostId || isServerAdmin(interaction);
}

async function updatePartyMessage(
  session: PartySession,
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

  const payload = await buildPartyMessagePayload(session, guild);
  await message.edit(payload);
}

async function closeParty(
  session: PartySession,
  guild: Guild | null
): Promise<void> {
  session.state = "closed";
  await updatePartyMessage(session, guild);
  deleteParty(session.id);
}

async function repostParty(
  session: PartySession,
  guild: Guild,
  targetChannel: TextChannel
): Promise<void> {
  const oldChannel = guild.channels.cache.get(session.channelId) as
    | TextChannel
    | undefined;
  const oldMessage =
    oldChannel && oldChannel.id !== targetChannel.id
      ? await oldChannel.messages.fetch(session.messageId).catch(() => null)
      : oldChannel?.id === targetChannel.id
        ? await targetChannel.messages.fetch(session.messageId).catch(() => null)
        : null;

  const payload = await buildPartyMessagePayload(session, guild);
  const newMessage = await targetChannel.send(payload);

  session.channelId = targetChannel.id;
  session.messageId = newMessage.id;
  saveParty(session);

  if (oldMessage && oldMessage.id !== newMessage.id && oldMessage.embeds[0]) {
    const embed = EmbedBuilder.from(oldMessage.embeds[0]);
    const prevDesc = oldMessage.embeds[0].description ?? "";
    embed.setDescription(`${prevDesc}\n\n↘️ **아래로 끌올**되었습니다.`);
    await oldMessage.edit({ embeds: [embed], components: [] });
  }
}

function resolvePartyFromOption(
  interaction: ChatInputCommandInteraction
): PartySession | null {
  const partyId = interaction.options.getString("파티", true);
  const session = getParty(partyId);
  if (!session || session.state !== "open") return null;
  if (session.guildId !== interaction.guildId) return null;
  return session;
}

export async function handlePartyAutocomplete(
  interaction: AutocompleteInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.respond([]);
    return;
  }

  const focused = interaction.options.getFocused();
  const choices = getPartyAutocompleteChoices(interaction.guild, focused);
  await interaction.respond(choices);
}

export async function handlePartyCreateCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const targetCount = interaction.options.getInteger("인원", true);
  const title = interaction.options.getString("제목", true).trim();
  const content = interaction.options.getString("설명")?.trim() ?? "";

  if (targetCount < 1 || targetCount > 99) {
    await interaction.reply({
      content: "목표 인원은 **1~99명** 사이로 설정해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (title.length < 1 || title.length > 100) {
    await interaction.reply({
      content: "제목은 **1~100자** 이내로 입력해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (content.length > 500) {
    await interaction.reply({
      content: "설명은 **500자** 이내로 입력해주세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply();

  const sessionId = createPartySessionId();
  const session = createPartySession(
    sessionId,
    interaction.guild.id,
    interaction.channelId,
    "",
    interaction.user.id,
    title,
    content,
    targetCount
  );

  const payload = await buildPartyMessagePayload(session, interaction.guild);
  const message = await interaction.editReply(payload);
  if (!message) return;

  session.messageId = message.id;
  saveParty(session);
}

export async function handleAddParticipantCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "서버에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = resolvePartyFromOption(interaction);
  if (!session) {
    await interaction.reply({
      content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageParty(session, interaction.user.id, interaction)) {
    await interaction.reply({
      content: `참가자 추가는 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
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
      content: `<@${target.id}>님은 이미 참가 중입니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  session.participants.push(target.id);
  saveParty(session);
  await updatePartyMessage(session, interaction.guild);

  await interaction.reply({
    content: `**${session.title}** 파티에 <@${target.id}>님을 추가했습니다. (${session.participants.length}/${session.targetCount}명)`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handleRemoveParticipantCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "서버에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = resolvePartyFromOption(interaction);
  if (!session) {
    await interaction.reply({
      content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageParty(session, interaction.user.id, interaction)) {
    await interaction.reply({
      content: `참가자 제거는 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const target = interaction.options.getUser("참가자", true);
  if (!session.participants.includes(target.id)) {
    await interaction.reply({
      content: `<@${target.id}>님은 이 파티 참가자가 아닙니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  session.participants = session.participants.filter((id) => id !== target.id);
  saveParty(session);
  await updatePartyMessage(session, interaction.guild);

  await interaction.reply({
    content: `**${session.title}** 파티에서 <@${target.id}>님을 제거했습니다. (${session.participants.length}/${session.targetCount}명)`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePartyRemoveCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: "서버에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = resolvePartyFromOption(interaction);
  if (!session) {
    await interaction.reply({
      content: "선택한 파티를 찾을 수 없습니다. 이미 제거되었을 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageParty(session, interaction.user.id, interaction)) {
    await interaction.reply({
      content: `파티 제거는 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const title = session.title;
  await closeParty(session, interaction.guild);

  await interaction.reply({
    content: `**${title}** 파티를 제거했습니다.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePartyRepostCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!interaction.guild || !interaction.channel?.isTextBased()) {
    await interaction.reply({
      content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const session = resolvePartyFromOption(interaction);
  if (!session) {
    await interaction.reply({
      content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!canManageParty(session, interaction.user.id, interaction)) {
    await interaction.reply({
      content: `끌올은 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await repostParty(session, interaction.guild, interaction.channel as TextChannel);

  await interaction.reply({
    content: `**${session.title}** 파티를 채널 맨 아래로 끌올했습니다.`,
    flags: MessageFlags.Ephemeral,
  });
}

export async function handlePartyButton(
  interaction: ButtonInteraction
): Promise<void> {
  const parts = interaction.customId.split(":");
  if (parts.length < 3 || parts[0] !== "pt") return;

  const sessionId = parts[1];
  const action = parts[2];
  const session = getParty(sessionId);

  if (!session) {
    await interaction.reply({
      content:
        "파티가 만료되었습니다. 봇이 재시작되었거나 **오래된 메시지**일 수 있습니다.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const guild = interaction.guild;
  const userId = interaction.user.id;

  switch (action) {
    case "join": {
      if (session.state !== "open") {
        await interaction.reply({
          content: "마감된 파티에는 참가할 수 없습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (session.participants.includes(userId)) {
        await interaction.reply({
          content: "이미 참가하셨습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.participants.push(userId);
      await interaction.deferUpdate();
      saveParty(session);
      await updatePartyMessage(session, guild);
      return;
    }

    case "leave": {
      if (!session.participants.includes(userId)) {
        await interaction.reply({
          content: "참가 신청하지 않으셨습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      session.participants = session.participants.filter((id) => id !== userId);
      await interaction.deferUpdate();
      saveParty(session);
      await updatePartyMessage(session, guild);
      return;
    }

    case "close": {
      if (session.state !== "open") {
        await interaction.reply({
          content: "이미 마감되었습니다.",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (!canManageParty(session, userId, interaction)) {
        await interaction.reply({
          content: `마감은 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      await interaction.deferUpdate();
      await closeParty(session, guild);
      return;
    }

    default:
      return;
  }
}
