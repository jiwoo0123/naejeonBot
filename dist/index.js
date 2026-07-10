"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const party_1 = require("./handlers/party");
const party_ui_1 = require("./party-ui");
const party_store_1 = require("./party-store");
const constants_1 = require("./constants");
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error(`[${constants_1.BOT_NAME}] DISCORD_TOKEN 환경 변수가 필요합니다.`);
    process.exit(1);
}
(0, party_store_1.loadPartySessions)();
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers],
});
client.once(discord_js_1.Events.ClientReady, (c) => {
    console.log(`[${constants_1.BOT_NAME}] 준비 완료: ${c.user.tag}`);
    console.log(`[${constants_1.BOT_NAME}] 버전: ${process.env.npm_package_version ?? "unknown"}`);
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isAutocomplete()) {
            const partyCommands = [
                "참가자추가",
                "참가자제거",
                "파티수정",
                "파티제거",
                "끌올",
            ];
            if (partyCommands.includes(interaction.commandName)) {
                await (0, party_1.handlePartyAutocomplete)(interaction);
            }
            return;
        }
        if (interaction.isModalSubmit()) {
            if (interaction.customId === party_ui_1.PARTY_CREATE_MODAL_ID) {
                await (0, party_1.handlePartyCreateModal)(interaction);
            }
            else if ((0, party_ui_1.parsePartyEditModalId)(interaction.customId)) {
                await (0, party_1.handlePartyEditModal)(interaction);
            }
            return;
        }
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "파티생성") {
                await (0, party_1.handlePartyCreateCommand)(interaction);
            }
            else if (interaction.commandName === "파티수정") {
                await (0, party_1.handlePartyEditCommand)(interaction);
            }
            else if (interaction.commandName === "참가자추가") {
                await (0, party_1.handleAddParticipantCommand)(interaction);
            }
            else if (interaction.commandName === "참가자제거") {
                await (0, party_1.handleRemoveParticipantCommand)(interaction);
            }
            else if (interaction.commandName === "파티제거") {
                await (0, party_1.handlePartyRemoveCommand)(interaction);
            }
            else if (interaction.commandName === "끌올") {
                await (0, party_1.handlePartyRepostCommand)(interaction);
            }
            return;
        }
        if (interaction.isButton()) {
            const parsed = (0, party_ui_1.parsePartyButtonId)(interaction.customId);
            if (parsed) {
                await (0, party_1.handlePartyButton)(interaction);
            }
        }
    }
    catch (error) {
        console.error(`[${constants_1.BOT_NAME}] Interaction error:`, error);
        const msg = {
            content: "오류가 발생했습니다. 다시 시도해주세요.",
            flags: discord_js_1.MessageFlags.Ephemeral,
        };
        if (interaction.isRepliable()) {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg).catch(() => { });
            }
            else {
                await interaction.reply(msg).catch(() => { });
            }
        }
    }
});
client.login(token);
