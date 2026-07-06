"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !clientId) {
    console.error("DISCORD_TOKEN과 DISCORD_CLIENT_ID가 필요합니다.");
    process.exit(1);
}
const commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("내전")
        .setDescription("롤 내전 모집 및 팀 구성을 시작합니다.")
        .toJSON(),
];
const rest = new discord_js_1.REST({ version: "10" }).setToken(token);
async function main() {
    const appId = clientId;
    if (guildId) {
        await rest.put(discord_js_1.Routes.applicationGuildCommands(appId, guildId), {
            body: commands,
        });
        console.log(`길드(${guildId})에 /내전 명령어를 등록했습니다.`);
    }
    else {
        await rest.put(discord_js_1.Routes.applicationCommands(appId), { body: commands });
        console.log("전역 /내전 명령어를 등록했습니다. (반영까지 최대 1시간)");
    }
}
main().catch(console.error);
