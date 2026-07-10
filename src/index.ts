import "dotenv/config";
import {
  Client,
  Events,
  GatewayIntentBits,
  Interaction,
  MessageFlags,
  type InteractionReplyOptions,
} from "discord.js";
import {
  handleAddParticipantCommand,
  handlePartyAutocomplete,
  handlePartyButton,
  handlePartyCreateCommand,
  handlePartyRemoveCommand,
  handleRemoveParticipantCommand,
} from "./handlers/party";
import { parsePartyButtonId } from "./party-ui";
import { loadPartySessions } from "./party-store";

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error("DISCORD_TOKEN 환경 변수가 필요합니다.");
  process.exit(1);
}

loadPartySessions();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, (c) => {
  console.log(`봇 준비 완료: ${c.user.tag}`);
  console.log(`코드 버전: ${process.env.npm_package_version ?? "unknown"}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const partyCommands = ["참가자추가", "참가자제거", "파티제거"];
      if (partyCommands.includes(interaction.commandName)) {
        await handlePartyAutocomplete(interaction);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "파티생성") {
        await handlePartyCreateCommand(interaction);
      } else if (interaction.commandName === "참가자추가") {
        await handleAddParticipantCommand(interaction);
      } else if (interaction.commandName === "참가자제거") {
        await handleRemoveParticipantCommand(interaction);
      } else if (interaction.commandName === "파티제거") {
        await handlePartyRemoveCommand(interaction);
      }
      return;
    }

    if (interaction.isButton()) {
      const parsed = parsePartyButtonId(interaction.customId);
      if (parsed) {
        await handlePartyButton(interaction);
      }
    }
  } catch (error) {
    console.error("Interaction error:", error);
    const msg: InteractionReplyOptions = {
      content: "오류가 발생했습니다. 다시 시도해주세요.",
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(msg).catch(() => {});
      } else {
        await interaction.reply(msg).catch(() => {});
      }
    }
  }
});

client.login(token);
