"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const discord_js_1 = require("discord.js");
const constants_1 = require("./constants");
const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token || !clientId) {
    console.error(`[${constants_1.BOT_NAME}] DISCORD_TOKEN과 DISCORD_CLIENT_ID가 필요합니다.`);
    process.exit(1);
}
const partyOption = (builder) => builder.addStringOption((option) => option
    .setName("파티")
    .setDescription("대상 파티 선택")
    .setRequired(true)
    .setAutocomplete(true));
const commands = [
    new discord_js_1.SlashCommandBuilder()
        .setName("파티생성")
        .setDescription("파티 모집 임베드를 작성합니다.")
        .toJSON(),
    partyOption(new discord_js_1.SlashCommandBuilder()
        .setName("파티수정")
        .setDescription("진행 중인 파티 정보를 수정합니다.")).toJSON(),
    partyOption(new discord_js_1.SlashCommandBuilder()
        .setName("참가자추가")
        .setDescription("파티에 참가자를 직접 추가합니다."))
        .addUserOption((option) => option
        .setName("참가자")
        .setDescription("추가할 사용자 (@태그)")
        .setRequired(true))
        .toJSON(),
    partyOption(new discord_js_1.SlashCommandBuilder()
        .setName("참가자제거")
        .setDescription("파티에서 참가자를 제거합니다."))
        .addUserOption((option) => option
        .setName("참가자")
        .setDescription("제거할 사용자 (@태그)")
        .setRequired(true))
        .toJSON(),
    partyOption(new discord_js_1.SlashCommandBuilder()
        .setName("파티제거")
        .setDescription("진행 중인 파티를 제거(마감)합니다.")).toJSON(),
    partyOption(new discord_js_1.SlashCommandBuilder()
        .setName("끌올")
        .setDescription("파티 메시지를 채널 맨 아래로 끌어올립니다.")).toJSON(),
];
const rest = new discord_js_1.REST({ version: "10" }).setToken(token);
async function main() {
    const appId = clientId;
    if (guildId) {
        await rest.put(discord_js_1.Routes.applicationGuildCommands(appId, guildId), {
            body: commands,
        });
        console.log(`[${constants_1.BOT_NAME}] 길드(${guildId})에 슬래시 명령어를 등록했습니다.`);
    }
    else {
        await rest.put(discord_js_1.Routes.applicationCommands(appId), { body: commands });
        console.log(`[${constants_1.BOT_NAME}] 전역 슬래시 명령어를 등록했습니다. (반영까지 최대 1시간)`);
    }
}
main().catch(console.error);
