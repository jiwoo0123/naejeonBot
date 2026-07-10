import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ApplicationCommandOptionChoiceData,
} from "discord.js";
import { getActivePartiesByGuild } from "./party-store";
import { PartySession } from "./party-types";

export const PARTY_CREATE_MODAL_ID = "pt:create";

export function buildPartyCreateModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(PARTY_CREATE_MODAL_ID)
    .setTitle("파티 만들기")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("제목")
          .setPlaceholder("예: 발로란트 5인큐")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("count")
          .setLabel("목표 인원")
          .setPlaceholder("1~99")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(2)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("설명")
          .setPlaceholder("모집 상세 내용을 입력하세요 (줄바꿈 가능)")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      )
    );
}

export function partyButtonId(sessionId: string, action: string): string {
  return `pt:${sessionId}:${action}`;
}

export function parsePartyButtonId(customId: string): {
  sessionId: string;
  action: string;
} | null {
  const parts = customId.split(":");
  if (parts.length < 3 || parts[0] !== "pt") return null;
  return { sessionId: parts[1], action: parts[2] };
}

async function displayName(
  guild: Guild | null,
  userId: string
): Promise<string> {
  if (!guild) return `<@${userId}>`;
  const member = await guild.members.fetch(userId).catch(() => null);
  return member?.displayName ?? `<@${userId}>`;
}

async function displayNames(
  guild: Guild | null,
  userIds: string[]
): Promise<string[]> {
  return Promise.all(userIds.map((id) => displayName(guild, id)));
}

function progressBar(current: number, target: number, width = 12): string {
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

function partyColor(session: PartySession): number {
  if (session.state === "closed") return 0x95a5a6;
  if (session.participants.length >= session.targetCount) return 0x57f287;
  return 0x5865f2;
}

function statusBadge(session: PartySession): string {
  const { participants, targetCount, state } = session;
  const count = participants.length;

  if (state === "closed") {
    return count >= targetCount ? "🎉 목표 달성 · 마감" : "🔒 파티 마감";
  }
  if (count >= targetCount) return "✅ 목표 달성 (추가 참가 가능)";
  return `🔥 모집 중 · ${targetCount - count}명 남음`;
}

function formatParticipantList(names: string[]): string {
  const separator = " · ";
  const lines: string[] = [];
  let current = "";

  for (const name of names) {
    const next = current ? `${current}${separator}${name}` : name;
    if (next.length > 1000) {
      if (current) lines.push(current);
      current = name;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);
  return lines.join("\n");
}

function formatBody(content: string): string {
  return content
    .split("\n")
    .map((line) => (line.trim() ? `> ${line}` : ">"))
    .join("\n");
}

export function formatPartyLabel(
  session: PartySession,
  guild: Guild
): string {
  const channel = guild.channels.cache.get(session.channelId);
  const channelName = channel?.isTextBased()
    ? `#${channel.name}`
    : "삭제된 채널";
  const label = `${session.title} · ${session.participants.length}/${session.targetCount}명 · ${channelName}`;
  return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}

export function getPartyAutocompleteChoices(
  guild: Guild,
  focused: string
): ApplicationCommandOptionChoiceData[] {
  const query = focused.toLowerCase();
  return getActivePartiesByGuild(guild.id)
    .filter((session) => {
      const label = formatPartyLabel(session, guild).toLowerCase();
      return !query || label.includes(query) || session.title.toLowerCase().includes(query);
    })
    .slice(0, 25)
    .map((session) => ({
      name: formatPartyLabel(session, guild),
      value: session.id,
    }));
}

export async function buildPartyEmbed(
  session: PartySession,
  guild: Guild | null
): Promise<EmbedBuilder> {
  const names = await displayNames(guild, session.participants);
  const count = session.participants.length;
  const { targetCount, title, content, state } = session;
  const hostName = await displayName(guild, session.hostId);
  const hostMember = guild
    ? await guild.members.fetch(session.hostId).catch(() => null)
    : null;

  const embed = new EmbedBuilder()
    .setColor(partyColor(session))
    .setTitle(state === "closed" ? `✅ ${title}` : `🎮 ${title}`)
    .setTimestamp();

  if (hostMember) {
    embed.setAuthor({
      name: `${hostName}님의 파티`,
      iconURL: hostMember.user.displayAvatarURL({ size: 64 }),
    });
    embed.setThumbnail(hostMember.user.displayAvatarURL({ size: 128 }));
  }

  const body = content.trim();
  if (body) {
    embed.setDescription(formatBody(body));
  }

  embed.addFields(
    {
      name: "📊 모집 현황",
      value: `**${count}** / **${targetCount}명**\n\`${progressBar(count, targetCount)}\``,
      inline: true,
    },
    {
      name: "📌 상태",
      value: statusBadge(session),
      inline: true,
    }
  );

  if (names.length > 0) {
    embed.addFields({
      name: `👥 참가자 · ${count}명`,
      value: formatParticipantList(names),
    });
  } else {
    embed.addFields({
      name: "👥 참가자",
      value: "*아직 없음 — 첫 참가자가 되어보세요!*",
    });
  }

  embed.setFooter({
    text:
      state === "closed"
        ? `파티 마감 · ${hostName}`
        : `마감은 주최자 또는 서버 관리자만 가능`,
  });

  return embed;
}

export async function buildPartyComponents(
  session: PartySession
): Promise<ActionRowBuilder<ButtonBuilder>[]> {
  if (session.state === "closed") {
    return [];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(partyButtonId(session.id, "join"))
        .setLabel("참가")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✋"),
      new ButtonBuilder()
        .setCustomId(partyButtonId(session.id, "leave"))
        .setLabel("참가취소")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("❌"),
      new ButtonBuilder()
        .setCustomId(partyButtonId(session.id, "close"))
        .setLabel("마감")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒")
    ),
  ];
}

export async function buildPartyMessagePayload(
  session: PartySession,
  guild: Guild | null
) {
  return {
    embeds: [await buildPartyEmbed(session, guild)],
    components: await buildPartyComponents(session),
  };
}
