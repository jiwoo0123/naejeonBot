"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handlePartyAutocomplete = handlePartyAutocomplete;
exports.handlePartyCreateCommand = handlePartyCreateCommand;
exports.handlePartyCreateModal = handlePartyCreateModal;
exports.handlePartyEditCommand = handlePartyEditCommand;
exports.handlePartyEditModal = handlePartyEditModal;
exports.handleAddParticipantCommand = handleAddParticipantCommand;
exports.handleRemoveParticipantCommand = handleRemoveParticipantCommand;
exports.handlePartyRemoveCommand = handlePartyRemoveCommand;
exports.handlePartyRepostCommand = handlePartyRepostCommand;
exports.handlePartyButton = handlePartyButton;
const discord_js_1 = require("discord.js");
const party_store_1 = require("../party-store");
const party_ui_1 = require("../party-ui");
const party_types_1 = require("../party-types");
function isServerAdmin(interaction) {
    if (!interaction.inGuild())
        return false;
    const perms = interaction.memberPermissions;
    if (!perms)
        return false;
    return (perms.has(discord_js_1.PermissionFlagsBits.Administrator) ||
        perms.has(discord_js_1.PermissionFlagsBits.ManageGuild));
}
function canManageParty(session, userId, interaction) {
    return userId === session.hostId || isServerAdmin(interaction);
}
async function updatePartyMessage(session, guild) {
    const channel = guild?.channels.cache.get(session.channelId);
    if (!channel)
        return;
    const message = await channel.messages
        .fetch(session.messageId)
        .catch(() => null);
    if (!message)
        return;
    const payload = await (0, party_ui_1.buildPartyMessagePayload)(session, guild);
    await message.edit(payload);
}
async function closeParty(session, guild) {
    session.state = "closed";
    await updatePartyMessage(session, guild);
    (0, party_store_1.deleteParty)(session.id);
}
async function repostParty(session, guild, targetChannel) {
    const oldChannel = guild.channels.cache.get(session.channelId);
    const oldMessage = oldChannel && oldChannel.id !== targetChannel.id
        ? await oldChannel.messages.fetch(session.messageId).catch(() => null)
        : oldChannel?.id === targetChannel.id
            ? await targetChannel.messages.fetch(session.messageId).catch(() => null)
            : null;
    const payload = await (0, party_ui_1.buildPartyMessagePayload)(session, guild);
    const newMessage = await targetChannel.send(payload);
    session.channelId = targetChannel.id;
    session.messageId = newMessage.id;
    (0, party_store_1.saveParty)(session);
    if (oldMessage && oldMessage.id !== newMessage.id && oldMessage.embeds[0]) {
        const embed = discord_js_1.EmbedBuilder.from(oldMessage.embeds[0]);
        const prevDesc = oldMessage.embeds[0].description ?? "";
        embed.setDescription(`${prevDesc}\n\n↘️ **아래로 끌올**되었습니다.`);
        await oldMessage.edit({ embeds: [embed], components: [] });
    }
}
function resolvePartyFromOption(interaction) {
    const partyId = interaction.options.getString("파티", true);
    const session = (0, party_store_1.getParty)(partyId);
    if (!session || session.state !== "open")
        return null;
    if (session.guildId !== interaction.guildId)
        return null;
    return session;
}
function parsePartyModalFields(interaction) {
    const title = interaction.fields.getTextInputValue("title").trim();
    const content = interaction.fields.getTextInputValue("content").trim();
    const countRaw = interaction.fields.getTextInputValue("count").trim();
    const targetCount = Number.parseInt(countRaw, 10);
    if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 99) {
        return { ok: false, message: "목표 인원은 **1~99** 사이의 숫자로 입력해주세요." };
    }
    if (title.length < 1 || title.length > 100) {
        return { ok: false, message: "제목은 **1~100자** 이내로 입력해주세요." };
    }
    if (content.length > 500) {
        return { ok: false, message: "설명은 **500자** 이내로 입력해주세요." };
    }
    return { ok: true, title, content, targetCount };
}
async function handlePartyAutocomplete(interaction) {
    if (!interaction.guild) {
        await interaction.respond([]);
        return;
    }
    const focused = interaction.options.getFocused();
    const choices = (0, party_ui_1.getPartyAutocompleteChoices)(interaction.guild, focused);
    await interaction.respond(choices);
}
async function handlePartyCreateCommand(interaction) {
    if (!interaction.guild || !interaction.channel?.isTextBased()) {
        await interaction.reply({
            content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.showModal((0, party_ui_1.buildPartyCreateModal)());
}
async function handlePartyCreateModal(interaction) {
    if (!interaction.guild || !interaction.channel?.isTextBased()) {
        await interaction.reply({
            content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const parsed = parsePartyModalFields(interaction);
    if (!parsed.ok) {
        await interaction.reply({
            content: parsed.message,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const { title, content, targetCount } = parsed;
    if (!interaction.channelId) {
        await interaction.reply({
            content: "채널 정보를 확인할 수 없습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.deferReply();
    const sessionId = (0, party_store_1.createPartySessionId)();
    const session = (0, party_types_1.createPartySession)(sessionId, interaction.guild.id, interaction.channelId, "", interaction.user.id, title, content, targetCount);
    const payload = await (0, party_ui_1.buildPartyMessagePayload)(session, interaction.guild);
    const message = await interaction.editReply(payload);
    if (!message)
        return;
    session.messageId = message.id;
    (0, party_store_1.saveParty)(session);
}
async function handlePartyEditCommand(interaction) {
    if (!interaction.guild) {
        await interaction.reply({
            content: "서버에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const session = resolvePartyFromOption(interaction);
    if (!session) {
        await interaction.reply({
            content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!canManageParty(session, interaction.user.id, interaction)) {
        await interaction.reply({
            content: `파티 수정은 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.showModal((0, party_ui_1.buildPartyEditModal)(session));
}
async function handlePartyEditModal(interaction) {
    if (!interaction.guild) {
        await interaction.reply({
            content: "서버에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const sessionId = (0, party_ui_1.parsePartyEditModalId)(interaction.customId);
    const session = sessionId ? (0, party_store_1.getParty)(sessionId) : undefined;
    if (!session || session.state !== "open" || session.guildId !== interaction.guild.id) {
        await interaction.reply({
            content: "수정할 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!canManageParty(session, interaction.user.id, interaction)) {
        await interaction.reply({
            content: `파티 수정은 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const parsed = parsePartyModalFields(interaction);
    if (!parsed.ok) {
        await interaction.reply({
            content: parsed.message,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const { title, content, targetCount } = parsed;
    session.title = title;
    session.content = content;
    session.targetCount = targetCount;
    (0, party_store_1.saveParty)(session);
    await updatePartyMessage(session, interaction.guild);
    await interaction.reply({
        content: `**${title}** 파티를 수정했습니다.`,
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
}
async function handleAddParticipantCommand(interaction) {
    if (!interaction.guild) {
        await interaction.reply({
            content: "서버에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const session = resolvePartyFromOption(interaction);
    if (!session) {
        await interaction.reply({
            content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!canManageParty(session, interaction.user.id, interaction)) {
        await interaction.reply({
            content: `참가자 추가는 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const target = interaction.options.getUser("참가자", true);
    if (target.bot) {
        await interaction.reply({
            content: "봇은 참가자로 추가할 수 없습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (session.participants.includes(target.id)) {
        await interaction.reply({
            content: `<@${target.id}>님은 이미 참가 중입니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    session.participants.push(target.id);
    (0, party_store_1.saveParty)(session);
    await updatePartyMessage(session, interaction.guild);
    await interaction.reply({
        content: `**${session.title}** 파티에 <@${target.id}>님을 추가했습니다. (${session.participants.length}/${session.targetCount}명)`,
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
}
async function handleRemoveParticipantCommand(interaction) {
    if (!interaction.guild) {
        await interaction.reply({
            content: "서버에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const session = resolvePartyFromOption(interaction);
    if (!session) {
        await interaction.reply({
            content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!canManageParty(session, interaction.user.id, interaction)) {
        await interaction.reply({
            content: `참가자 제거는 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const target = interaction.options.getUser("참가자", true);
    if (!session.participants.includes(target.id)) {
        await interaction.reply({
            content: `<@${target.id}>님은 이 파티 참가자가 아닙니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    session.participants = session.participants.filter((id) => id !== target.id);
    (0, party_store_1.saveParty)(session);
    await updatePartyMessage(session, interaction.guild);
    await interaction.reply({
        content: `**${session.title}** 파티에서 <@${target.id}>님을 제거했습니다. (${session.participants.length}/${session.targetCount}명)`,
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
}
async function handlePartyRemoveCommand(interaction) {
    if (!interaction.guild) {
        await interaction.reply({
            content: "서버에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const session = resolvePartyFromOption(interaction);
    if (!session) {
        await interaction.reply({
            content: "선택한 파티를 찾을 수 없습니다. 이미 제거되었을 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!canManageParty(session, interaction.user.id, interaction)) {
        await interaction.reply({
            content: `파티 제거는 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const title = session.title;
    await closeParty(session, interaction.guild);
    await interaction.reply({
        content: `**${title}** 파티를 제거했습니다.`,
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
}
async function handlePartyRepostCommand(interaction) {
    if (!interaction.guild || !interaction.channel?.isTextBased()) {
        await interaction.reply({
            content: "서버 텍스트 채널에서만 사용할 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    const session = resolvePartyFromOption(interaction);
    if (!session) {
        await interaction.reply({
            content: "선택한 파티를 찾을 수 없습니다. 이미 마감되었을 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    if (!canManageParty(session, interaction.user.id, interaction)) {
        await interaction.reply({
            content: `끌올은 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        return;
    }
    await repostParty(session, interaction.guild, interaction.channel);
    await interaction.reply({
        content: `**${session.title}** 파티를 채널 맨 아래로 끌올했습니다.`,
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
}
async function handlePartyButton(interaction) {
    const parts = interaction.customId.split(":");
    if (parts.length < 3 || parts[0] !== "pt")
        return;
    const sessionId = parts[1];
    const action = parts[2];
    const session = (0, party_store_1.getParty)(sessionId);
    if (!session) {
        await interaction.reply({
            content: "파티가 만료되었습니다. 봇이 재시작되었거나 **오래된 메시지**일 수 있습니다.",
            flags: discord_js_1.MessageFlags.Ephemeral,
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
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            if (session.participants.includes(userId)) {
                await interaction.reply({
                    content: "이미 참가하셨습니다.",
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            session.participants.push(userId);
            await interaction.deferUpdate();
            (0, party_store_1.saveParty)(session);
            await updatePartyMessage(session, guild);
            return;
        }
        case "leave": {
            if (!session.participants.includes(userId)) {
                await interaction.reply({
                    content: "참가 신청하지 않으셨습니다.",
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            session.participants = session.participants.filter((id) => id !== userId);
            await interaction.deferUpdate();
            (0, party_store_1.saveParty)(session);
            await updatePartyMessage(session, guild);
            return;
        }
        case "close": {
            if (session.state !== "open") {
                await interaction.reply({
                    content: "이미 마감되었습니다.",
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                return;
            }
            if (!canManageParty(session, userId, interaction)) {
                await interaction.reply({
                    content: `마감은 <@${session.hostId}> 주최자 또는 **서버 관리자**만 할 수 있습니다.`,
                    flags: discord_js_1.MessageFlags.Ephemeral,
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
