"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const naejeon_1 = require("./handlers/naejeon");
const ui_1 = require("./ui");
const session_store_1 = require("./session-store");
const token = process.env.DISCORD_TOKEN;
if (!token) {
    console.error("DISCORD_TOKEN 환경 변수가 필요합니다.");
    process.exit(1);
}
(0, session_store_1.loadSessions)();
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds, discord_js_1.GatewayIntentBits.GuildMembers],
});
client.once(discord_js_1.Events.ClientReady, (c) => {
    console.log(`봇 준비 완료: ${c.user.tag}`);
    console.log(`코드 버전: ${process.env.npm_package_version ?? "unknown"}`);
});
client.on(discord_js_1.Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === "내전") {
                await (0, naejeon_1.handleNaejeonCommand)(interaction);
            }
            else if (interaction.commandName === "호스트변경") {
                await (0, naejeon_1.handleHostChangeCommand)(interaction);
            }
            else if (interaction.commandName === "참가자추가") {
                await (0, naejeon_1.handleAddParticipantCommand)(interaction);
            }
            else if (interaction.commandName === "참가자제거") {
                await (0, naejeon_1.handleRemoveParticipantCommand)(interaction);
            }
            return;
        }
        if (interaction.isButton()) {
            const parsed = (0, ui_1.parseButtonId)(interaction.customId);
            if (parsed) {
                await (0, naejeon_1.handleNaejeonButton)(interaction);
            }
        }
    }
    catch (error) {
        console.error("Interaction error:", error);
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
