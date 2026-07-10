export type PartyState = "open" | "closed";

export interface PartySession {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  hostId: string;
  title: string;
  content: string;
  targetCount: number;
  participants: string[];
  state: PartyState;
}

export function createPartySession(
  id: string,
  guildId: string,
  channelId: string,
  messageId: string,
  hostId: string,
  title: string,
  content: string,
  targetCount: number
): PartySession {
  return {
    id,
    guildId,
    channelId,
    messageId,
    hostId,
    title,
    content,
    targetCount,
    participants: [],
    state: "open",
  };
}
