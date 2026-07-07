import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Guild,
  User,
} from "discord.js";
import {
  NaejeonSession,
} from "./types";

export function buttonId(
  sessionId: string,
  action: string,
  payload?: string
): string {
  const base = `nj:${sessionId}:${action}`;
  return payload ? `${base}:${payload}` : base;
}

export function parseButtonId(customId: string): {
  sessionId: string;
  action: string;
  payload?: string;
} | null {
  const parts = customId.split(":");
  if (parts.length < 3 || parts[0] !== "nj") return null;
  return {
    sessionId: parts[1],
    action: parts[2],
    payload: parts[3],
  };
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

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

function buildHostControlRow(
  session: NaejeonSession
): ActionRowBuilder<ButtonBuilder> | null {
  if (session.state === "cancelled" || session.state === "ended") {
    return null;
  }

  const row = new ActionRowBuilder<ButtonBuilder>();

  if (session.state === "complete") {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(buttonId(session.id, "rematch"))
        .setLabel("재경기")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄"),
      new ButtonBuilder()
        .setCustomId(buttonId(session.id, "end"))
        .setLabel("내전 종료")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🏁")
    );
    return row;
  }

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(buttonId(session.id, "cancel"))
      .setLabel("내전 취소")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚫"),
    new ButtonBuilder()
      .setCustomId(buttonId(session.id, "end"))
      .setLabel("내전 종료")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🏁")
      .setDisabled(true)
  );

  return row;
}

export async function buildEmbed(
  session: NaejeonSession,
  guild: Guild | null
): Promise<EmbedBuilder> {
  const embed = new EmbedBuilder()
    .setTitle("⚔️ 롤 내전")
    .setColor(0x5865f2)
    .setTimestamp();

  switch (session.state) {
    case "registering": {
      const names = await displayNames(guild, session.participants);
      embed.setDescription(
        "아래 **참가신청** 버튼을 눌러 내전에 참가하세요.\n" +
          "인원 모집이 끝나면 **마감** 버튼을 눌러주세요."
      );
      embed.addFields({
        name: `참가자 (${session.participants.length}명)`,
        value: names.length > 0 ? names.map((n) => `• ${n}`).join("\n") : "아직 없음",
      });
      break;
    }

    case "selecting_captains": {
      const names = await displayNames(guild, session.participants);
      const captainNames = await displayNames(guild, session.captainCandidates);
      const kickNames = await displayNames(guild, session.kickSelections);

      if (session.kickMode) {
        embed.setDescription(
          "🚪 **보내기 모드** —보낼 참가자를 선택한 뒤 **보내기** 버튼을 눌러주세요.\n" +
            `(호스트 또는 **서버 관리자**만 사용 가능)`
        );
        embed.addFields(
          {
            name: `참가자 (${session.participants.length}명)`,
            value: names.map((n) => `• ${n}`).join("\n"),
          },
          {
            name: `보내기 대상 (${session.kickSelections.length}명)`,
            value:
              kickNames.length > 0
                ? kickNames.map((n) => `• ${n}`).join("\n")
                : "아직 선택하지 않음",
          }
        );
      } else {
        const desc = session.isRematch
          ? "재경기 — 팀장이 될 **2명**을 선택한 뒤 **팀장 확정** 버튼을 눌러주세요.\n" +
            "인원 변경이 필요하면 **추가 신청** / **빠지기** 버튼을 사용하세요."
          : "팀장이 될 **2명**을 선택한 뒤 **팀장 확정** 버튼을 눌러주세요.";
        embed.setDescription(desc);
        embed.addFields(
          {
            name: `참가자 (${session.participants.length}명)`,
            value: names.map((n) => `• ${n}`).join("\n"),
          },
          {
            name: `선택된 팀장 (${session.captainCandidates.length}/2)`,
            value:
              captainNames.length > 0
                ? captainNames.map((n) => `⭐ ${n}`).join("\n")
                : "아직 선택되지 않음",
          }
        );
      }
      break;
    }

    case "drafting": {
      const currentCaptain = session.pickOrder[session.currentPickerIndex];
      const remainingNames = await displayNames(guild, session.remaining);
      const selectedNames = await displayNames(guild, session.draftSelections);
      const firstPicker = await displayName(guild, session.pickOrder[0]);
      const secondPicker = await displayName(guild, session.pickOrder[1]);
      const [c1, c2] = session.captains;
      const n1 = await displayName(guild, c1);
      const n2 = await displayName(guild, c2);
      const roll1 = session.pickOrderRolls[c1] ?? 0;
      const roll2 = session.pickOrderRolls[c2] ?? 0;

      embed.setDescription(
        `🎲 **주사위(1~100)** 로 선·후픽 순서를 정했습니다!\n` +
          `${n1} **${roll1}** vs ${n2} **${roll2}**\n` +
          `🏆 **선픽:** ${firstPicker} · **후픽:** ${secondPicker}\n\n` +
          `<@${currentCaptain}> 팀장님, 데려갈 팀원을 **복수 선택**한 뒤 **뽑기** 버튼을 눌러주세요.\n` +
          `선택한 인원이 **모두** 팀에 합류합니다.\n` +
          `(호스트 또는 **서버 관리자**가 대신 진행할 수 있습니다)`
      );
      embed.addFields(
        {
          name: "🎯 현재 차례",
          value: `<@${currentCaptain}> (선택 ${session.draftSelections.length}명)`,
        },
        {
          name: `남은 인원 (${session.remaining.length}명)`,
          value:
            remainingNames.length > 0
              ? remainingNames.map((n) => `• ${n}`).join("\n")
              : "없음",
        }
      );

      if (selectedNames.length > 0) {
        embed.addFields({
          name: "선택 중인 후보",
          value: selectedNames.map((n) => `✅ ${n}`).join("\n"),
        });
      }

      for (const captainId of session.pickOrder) {
        const team = session.teams[captainId] ?? [];
        const captainName = await displayName(guild, captainId);
        const teamNames = await displayNames(guild, team);
        embed.addFields({
          name: `${captainName} 팀 (${team.length}명)`,
          value:
            teamNames.length > 0
              ? teamNames.map((n) => `• ${n}`).join("\n")
              : "아직 없음",
          inline: true,
        });
      }
      break;
    }

    case "complete": {
      const redCaptain = session.redTeamCaptainId!;
      const blueCaptain = session.pickOrder.find((id) => id !== redCaptain)!;
      const redTeam = [redCaptain, ...(session.teams[redCaptain] ?? [])];
      const blueTeam = [blueCaptain, ...(session.teams[blueCaptain] ?? [])];
      const redNames = await displayNames(guild, redTeam);
      const blueNames = await displayNames(guild, blueTeam);

      embed
        .setDescription(
          "내전 팀 구성이 완료되었습니다!\n" +
            "같은 인원으로 다시 하려면 **재경기** 버튼을 눌러주세요."
        )
        .setColor(0x57f287)
        .addFields(
          {
            name: "🔴 레드팀",
            value: redNames.map((n) => `• ${n}`).join("\n"),
          },
          {
            name: "🔵 블루팀",
            value: blueNames.map((n) => `• ${n}`).join("\n"),
          }
        );
      break;
    }

    case "cancelled": {
      embed
        .setDescription("❌ 내전이 취소되었습니다.")
        .setColor(0xed4245);
      if (session.participants.length > 0) {
        const names = await displayNames(guild, session.participants);
        embed.addFields({
          name: `참가했던 인원 (${session.participants.length}명)`,
          value: names.map((n) => `• ${n}`).join("\n"),
        });
      }
      break;
    }

    case "ended": {
      const redCaptain = session.redTeamCaptainId;
      embed.setDescription("🏁 내전이 종료되었습니다.").setColor(0x95a5a6);

      if (redCaptain) {
        const blueCaptain = session.pickOrder.find((id) => id !== redCaptain)!;
        const redTeam = [redCaptain, ...(session.teams[redCaptain] ?? [])];
        const blueTeam = [blueCaptain, ...(session.teams[blueCaptain] ?? [])];
        const redNames = await displayNames(guild, redTeam);
        const blueNames = await displayNames(guild, blueTeam);
        embed.addFields(
          {
            name: "🔴 레드팀",
            value: redNames.map((n) => `• ${n}`).join("\n"),
          },
          {
            name: "🔵 블루팀",
            value: blueNames.map((n) => `• ${n}`).join("\n"),
          }
        );
      }
      break;
    }
  }

  return embed;
}

export async function buildComponents(
  session: NaejeonSession,
  guild: Guild | null
): Promise<ActionRowBuilder<ButtonBuilder>[]> {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  switch (session.state) {
    case "registering": {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buttonId(session.id, "join"))
            .setLabel("참가신청")
            .setStyle(ButtonStyle.Success)
            .setEmoji("✋"),
          new ButtonBuilder()
            .setCustomId(buttonId(session.id, "leave"))
            .setLabel("참가취소")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("❌"),
          new ButtonBuilder()
            .setCustomId(buttonId(session.id, "close"))
            .setLabel("마감")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🔒")
        )
      );
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buttonId(session.id, "cancel"))
            .setLabel("내전 취소")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🚫"),
          new ButtonBuilder()
            .setCustomId(buttonId(session.id, "repost"))
            .setLabel("맨 아래로")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("⬇️")
        )
      );
      break;
    }

    case "selecting_captains": {
      const participantRows = chunk(session.participants, 5);

      for (const group of participantRows.slice(0, 3)) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (const userId of group) {
          const name = await displayName(guild, userId);
          if (session.kickMode) {
            const isSelected = session.kickSelections.includes(userId);
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(buttonId(session.id, "kick_select", userId))
                .setLabel(`🚪 ${name.slice(0, 76)}`)
                .setStyle(
                  isSelected ? ButtonStyle.Danger : ButtonStyle.Secondary
                )
            );
          } else {
            const isSelected = session.captainCandidates.includes(userId);
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(buttonId(session.id, "captain", userId))
                .setLabel(name.slice(0, 80))
                .setStyle(
                  isSelected ? ButtonStyle.Primary : ButtonStyle.Secondary
                )
                .setEmoji(isSelected ? "⭐" : "👤")
            );
          }
        }
        rows.push(row);
      }

      if (session.kickMode) {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "kick_confirm"))
              .setLabel("보내기")
              .setStyle(ButtonStyle.Danger)
              .setEmoji("🚪")
              .setDisabled(session.kickSelections.length === 0),
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "captain_mode"))
              .setLabel("팀장선택으로")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("⭐"),
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "cancel"))
              .setLabel("내전 취소")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("🚫")
          )
        );
      } else {
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "confirm_captains"))
              .setLabel("팀장 확정")
              .setStyle(ButtonStyle.Success)
              .setDisabled(session.captainCandidates.length !== 2)
              .setEmoji("✅"),
            ...(session.isRematch
              ? [
                  new ButtonBuilder()
                    .setCustomId(buttonId(session.id, "join"))
                    .setLabel("추가 신청")
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji("➕"),
                  new ButtonBuilder()
                    .setCustomId(buttonId(session.id, "leave"))
                    .setLabel("빠지기")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("👋"),
                ]
              : [])
          )
        );
        rows.push(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "cancel"))
              .setLabel("내전 취소")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("🚫"),
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "kick_mode"))
              .setLabel("보내기")
              .setStyle(ButtonStyle.Secondary)
              .setEmoji("🚪")
          )
        );
      }
      break;
    }

    case "drafting": {
      const currentCaptain = session.pickOrder[session.currentPickerIndex];
      const remainingRows = chunk(session.remaining, 5);

      for (const group of remainingRows.slice(0, 4)) {
        const row = new ActionRowBuilder<ButtonBuilder>();
        for (const userId of group) {
          const name = await displayName(guild, userId);
          const isSelected = session.draftSelections.includes(userId);
          row.addComponents(
            new ButtonBuilder()
              .setCustomId(buttonId(session.id, "draft_select", userId))
              .setLabel(name.slice(0, 80))
              .setStyle(isSelected ? ButtonStyle.Success : ButtonStyle.Secondary)
              .setDisabled(userId === currentCaptain)
          );
        }
        rows.push(row);
      }

      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buttonId(session.id, "draft_pick"))
            .setLabel("뽑기")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("🎲")
            .setDisabled(session.draftSelections.length === 0)
        )
      );
      {
        const hostRow = buildHostControlRow(session);
        if (hostRow) rows.push(hostRow);
      }
      break;
    }

    case "complete": {
      const hostRow = buildHostControlRow(session);
      if (hostRow) rows.push(hostRow);
      break;
    }

    case "cancelled":
    case "ended":
      break;
  }

  return rows;
}

export async function buildMessagePayload(
  session: NaejeonSession,
  guild: Guild | null
) {
  return {
    embeds: [await buildEmbed(session, guild)],
    components: await buildComponents(session, guild),
  };
}
