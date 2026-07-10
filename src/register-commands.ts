import "dotenv/config";
import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { BOT_NAME } from "./constants";

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error(`[${BOT_NAME}] DISCORD_TOKEN과 DISCORD_CLIENT_ID가 필요합니다.`);
  process.exit(1);
}

const partyOption = (builder: SlashCommandBuilder) =>
  builder.addStringOption((option) =>
    option
      .setName("파티")
      .setDescription("대상 파티 선택")
      .setRequired(true)
      .setAutocomplete(true)
  );

const commands = [
  new SlashCommandBuilder()
    .setName("파티생성")
    .setDescription("목표 인원, 제목, 설명으로 파티 모집을 시작합니다.")
    .addIntegerOption((option) =>
      option
        .setName("인원")
        .setDescription("목표 인원 (1~99)")
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(99)
    )
    .addStringOption((option) =>
      option
        .setName("제목")
        .setDescription("파티 제목 (임베드 상단에 표시)")
        .setRequired(true)
        .setMaxLength(100)
    )
    .addStringOption((option) =>
      option
        .setName("설명")
        .setDescription("파티 설명 (임베드 본문에 표시, 줄바꿈 가능)")
        .setRequired(false)
        .setMaxLength(500)
    )
    .toJSON(),
  partyOption(
    new SlashCommandBuilder()
      .setName("참가자추가")
      .setDescription("파티에 참가자를 직접 추가합니다.")
  )
    .addUserOption((option) =>
      option
        .setName("참가자")
        .setDescription("추가할 사용자 (@태그)")
        .setRequired(true)
    )
    .toJSON(),
  partyOption(
    new SlashCommandBuilder()
      .setName("참가자제거")
      .setDescription("파티에서 참가자를 제거합니다.")
  )
    .addUserOption((option) =>
      option
        .setName("참가자")
        .setDescription("제거할 사용자 (@태그)")
        .setRequired(true)
    )
    .toJSON(),
  partyOption(
    new SlashCommandBuilder()
      .setName("파티제거")
      .setDescription("진행 중인 파티를 제거(마감)합니다.")
  ).toJSON(),
  partyOption(
    new SlashCommandBuilder()
      .setName("끌올")
      .setDescription("파티 메시지를 채널 맨 아래로 끌어올립니다.")
  ).toJSON(),
];

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  const appId = clientId as string;
  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(appId, guildId), {
      body: commands,
    });
    console.log(`[${BOT_NAME}] 길드(${guildId})에 슬래시 명령어를 등록했습니다.`);
  } else {
    await rest.put(Routes.applicationCommands(appId), { body: commands });
    console.log(`[${BOT_NAME}] 전역 슬래시 명령어를 등록했습니다. (반영까지 최대 1시간)`);
  }
}

main().catch(console.error);
