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
    new discord_js_1.SlashCommandBuilder()
        .setName("호스트변경")
        .setDescription("진행 중인 내전의 호스트를 변경합니다.")
        .addUserOption((option) => option
        .setName("호스트")
        .setDescription("새 호스트로 지정할 사용자")
        .setRequired(true))
        .toJSON(),
    new discord_js_1.SlashCommandBuilder()
        .setName("참가자추가")
        .setDescription("진행 중인 내전에 참가자를 직접 추가합니다.")
        .addUserOption((option) => option
        .setName("참가자")
        .setDescription("추가할 사용자 (@태그)")
        .setRequired(true))
        .toJSON(),
];
const rest = new discord_js_1.REST({ version: "10" }).setToken(token);
async function main() {
    const appId = clientId;
    if (guildId) {
        await rest.put(discord_js_1.Routes.applicationGuildCommands(appId, guildId), {
            body: commands,
        });
        console.log(`길드(${guildId})에 슬래시 명령어를 등록했습니다.`);
    }
    else {
        await rest.put(discord_js_1.Routes.applicationCommands(appId), { body: commands });
        console.log("전역 슬래시 명령어를 등록했습니다. (반영까지 최대 1시간)");
    }
}
main().catch(console.error);
