import fs from "fs";
import path from "path";
import { NaejeonSession } from "./types";

const sessions = new Map<string, NaejeonSession>();
const channelSessions = new Map<string, string>();

const DATA_DIR = path.join(process.cwd(), "data");
const SESSION_FILE = path.join(DATA_DIR, "sessions.json");

interface PersistedData {
  sessions: Record<string, NaejeonSession>;
  channelSessions: Record<string, string>;
}

function persist(): void {
  const data: PersistedData = {
    sessions: Object.fromEntries(sessions),
    channelSessions: Object.fromEntries(channelSessions),
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function loadSessions(): void {
  if (!fs.existsSync(SESSION_FILE)) return;

  try {
    const data = JSON.parse(fs.readFileSync(SESSION_FILE, "utf-8")) as PersistedData;
    sessions.clear();
    channelSessions.clear();

    for (const [id, session] of Object.entries(data.sessions ?? {})) {
      sessions.set(id, session);
    }
    for (const [channelId, sessionId] of Object.entries(
      data.channelSessions ?? {}
    )) {
      channelSessions.set(channelId, sessionId);
    }
    console.log(`세션 ${sessions.size}개 복구됨`);
  } catch (error) {
    console.error("세션 파일 로드 실패:", error);
  }
}

export function getSession(sessionId: string): NaejeonSession | undefined {
  return sessions.get(sessionId);
}

export function saveSession(session: NaejeonSession): void {
  sessions.set(session.id, session);
  channelSessions.set(session.channelId, session.id);
  persist();
}

export function deleteSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    channelSessions.delete(session.channelId);
    sessions.delete(sessionId);
    persist();
  }
}

export function getActiveSessionByChannel(
  channelId: string
): NaejeonSession | undefined {
  const sessionId = channelSessions.get(channelId);
  if (!sessionId) return undefined;
  return sessions.get(sessionId);
}

export function createSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
