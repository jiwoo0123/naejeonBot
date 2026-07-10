"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PARTY_CREATE_MODAL_ID = void 0;
exports.buildPartyCreateModal = buildPartyCreateModal;
exports.partyButtonId = partyButtonId;
exports.parsePartyButtonId = parsePartyButtonId;
exports.formatPartyLabel = formatPartyLabel;
exports.getPartyAutocompleteChoices = getPartyAutocompleteChoices;
exports.buildPartyEmbed = buildPartyEmbed;
exports.buildPartyComponents = buildPartyComponents;
exports.buildPartyMessagePayload = buildPartyMessagePayload;
const discord_js_1 = require("discord.js");
const party_store_1 = require("./party-store");
exports.PARTY_CREATE_MODAL_ID = "pt:create";
function buildPartyCreateModal() {
    return new discord_js_1.ModalBuilder()
        .setCustomId(exports.PARTY_CREATE_MODAL_ID)
        .setTitle("파티 만들기")
        .addComponents(new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId("title")
        .setLabel("제목")
        .setPlaceholder("예: 발로란트 5인큐")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId("count")
        .setLabel("목표 인원")
        .setPlaceholder("1~99")
        .setStyle(discord_js_1.TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(2)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder()
        .setCustomId("content")
        .setLabel("설명")
        .setPlaceholder("모집 상세 내용을 입력하세요 (줄바꿈 가능)")
        .setStyle(discord_js_1.TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(500)));
}
function partyButtonId(sessionId, action) {
    return `pt:${sessionId}:${action}`;
}
function parsePartyButtonId(customId) {
    const parts = customId.split(":");
    if (parts.length < 3 || parts[0] !== "pt")
        return null;
    return { sessionId: parts[1], action: parts[2] };
}
async function displayName(guild, userId) {
    if (!guild)
        return `<@${userId}>`;
    const member = await guild.members.fetch(userId).catch(() => null);
    return member?.displayName ?? `<@${userId}>`;
}
async function displayNames(guild, userIds) {
    return Promise.all(userIds.map((id) => displayName(guild, id)));
}
function progressBar(current, target, width = 12) {
    const ratio = Math.min(current / target, 1);
    const filled = Math.round(ratio * width);
    const empty = width - filled;
    return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}
function partyColor(session) {
    if (session.state === "closed")
        return 0x95a5a6;
    if (session.participants.length >= session.targetCount)
        return 0x57f287;
    return 0x5865f2;
}
function statusBadge(session) {
    const { participants, targetCount, state } = session;
    const count = participants.length;
    if (state === "closed") {
        return count >= targetCount ? "🎉 목표 달성 · 마감" : "🔒 파티 마감";
    }
    if (count >= targetCount)
        return "✅ 목표 달성 (추가 참가 가능)";
    return `🔥 모집 중 · ${targetCount - count}명 남음`;
}
function formatParticipantList(names) {
    const separator = " · ";
    const lines = [];
    let current = "";
    for (const name of names) {
        const next = current ? `${current}${separator}${name}` : name;
        if (next.length > 1000) {
            if (current)
                lines.push(current);
            current = name;
        }
        else {
            current = next;
        }
    }
    if (current)
        lines.push(current);
    return lines.join("\n");
}
function formatBody(content) {
    return content
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n");
}
function formatPartyLabel(session, guild) {
    const channel = guild.channels.cache.get(session.channelId);
    const channelName = channel?.isTextBased()
        ? `#${channel.name}`
        : "삭제된 채널";
    const label = `${session.title} · ${session.participants.length}/${session.targetCount}명 · ${channelName}`;
    return label.length > 100 ? `${label.slice(0, 97)}...` : label;
}
function getPartyAutocompleteChoices(guild, focused) {
    const query = focused.toLowerCase();
    return (0, party_store_1.getActivePartiesByGuild)(guild.id)
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
async function buildPartyEmbed(session, guild) {
    const names = await displayNames(guild, session.participants);
    const count = session.participants.length;
    const { targetCount, title, content, state } = session;
    const hostName = await displayName(guild, session.hostId);
    const hostMember = guild
        ? await guild.members.fetch(session.hostId).catch(() => null)
        : null;
    const embed = new discord_js_1.EmbedBuilder()
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
    embed.addFields({
        name: "📊 모집 현황",
        value: `**${count}** / **${targetCount}명**\n\`${progressBar(count, targetCount)}\``,
        inline: true,
    }, {
        name: "📌 상태",
        value: statusBadge(session),
        inline: true,
    });
    if (names.length > 0) {
        embed.addFields({
            name: `👥 참가자 · ${count}명`,
            value: formatParticipantList(names),
        });
    }
    else {
        embed.addFields({
            name: "👥 참가자",
            value: "*아직 없음 — 첫 참가자가 되어보세요!*",
        });
    }
    embed.setFooter({
        text: state === "closed"
            ? `파티 마감 · ${hostName}`
            : `마감은 주최자 또는 서버 관리자만 가능`,
    });
    return embed;
}
async function buildPartyComponents(session) {
    if (session.state === "closed") {
        return [];
    }
    return [
        new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
            .setCustomId(partyButtonId(session.id, "join"))
            .setLabel("참가")
            .setStyle(discord_js_1.ButtonStyle.Success)
            .setEmoji("✋"), new discord_js_1.ButtonBuilder()
            .setCustomId(partyButtonId(session.id, "leave"))
            .setLabel("참가취소")
            .setStyle(discord_js_1.ButtonStyle.Secondary)
            .setEmoji("❌"), new discord_js_1.ButtonBuilder()
            .setCustomId(partyButtonId(session.id, "close"))
            .setLabel("마감")
            .setStyle(discord_js_1.ButtonStyle.Danger)
            .setEmoji("🔒")),
    ];
}
async function buildPartyMessagePayload(session, guild) {
    return {
        embeds: [await buildPartyEmbed(session, guild)],
        components: await buildPartyComponents(session),
    };
}
