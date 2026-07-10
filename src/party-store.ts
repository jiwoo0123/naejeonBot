import fs from "fs";
import path from "path";
import { PartySession } from "./party-types";

const sessions = new Map<string, PartySession>();

const DATA_DIR = path.join(process.cwd(), "data");
const SESSION_FILE = path.join(DATA_DIR, "party-sessions.json");

interface PersistedData {
  sessions: Record<string, PartySession>;
}

function persist(): void {
  const data: PersistedData = {
    sessions: Object.fromEntries(sessions),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function loadPartySessions(): void {
  if (!fs.existsSync(SESSION_FILE)) return;

  try {
    const data = JSON.parse(
      fs.readFileSync(SESSION_FILE, "utf-8")
    ) as PersistedData;
    sessions.clear();

    for (const [id, session] of Object.entries(data.sessions ?? {})) {
      sessions.set(id, session);
    }
    console.log(`파티 세션 ${sessions.size}개 복구됨`);
  } catch (error) {
    console.error("파티 세션 파일 로드 실패:", error);
  }
}

export function getParty(sessionId: string): PartySession | undefined {
  return sessions.get(sessionId);
}

export function saveParty(session: PartySession): void {
  sessions.set(session.id, session);
  persist();
}

export function deleteParty(sessionId: string): void {
  sessions.delete(sessionId);
  persist();
}

export function getActivePartiesByGuild(guildId: string): PartySession[] {
  return [...sessions.values()].filter(
    (s) => s.guildId === guildId && s.state === "open"
  );
}

export function createPartySessionId(): string {
  return `pt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
