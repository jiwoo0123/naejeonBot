"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSessions = loadSessions;
exports.getSession = getSession;
exports.saveSession = saveSession;
exports.deleteSession = deleteSession;
exports.getActiveSessionByChannel = getActiveSessionByChannel;
exports.createSessionId = createSessionId;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sessions = new Map();
const channelSessions = new Map();
const DATA_DIR = path_1.default.join(process.cwd(), "data");
const SESSION_FILE = path_1.default.join(DATA_DIR, "sessions.json");
function persist() {
    const data = {
        sessions: Object.fromEntries(sessions),
        channelSessions: Object.fromEntries(channelSessions),
    };
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    fs_1.default.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
}
function loadSessions() {
    if (!fs_1.default.existsSync(SESSION_FILE))
        return;
    try {
        const data = JSON.parse(fs_1.default.readFileSync(SESSION_FILE, "utf-8"));
        sessions.clear();
        channelSessions.clear();
        for (const [id, session] of Object.entries(data.sessions ?? {})) {
            sessions.set(id, session);
        }
        for (const [channelId, sessionId] of Object.entries(data.channelSessions ?? {})) {
            channelSessions.set(channelId, sessionId);
        }
        console.log(`세션 ${sessions.size}개 복구됨`);
    }
    catch (error) {
        console.error("세션 파일 로드 실패:", error);
    }
}
function getSession(sessionId) {
    return sessions.get(sessionId);
}
function saveSession(session) {
    sessions.set(session.id, session);
    channelSessions.set(session.channelId, session.id);
    persist();
}
function deleteSession(sessionId) {
    const session = sessions.get(sessionId);
    if (session) {
        channelSessions.delete(session.channelId);
        sessions.delete(sessionId);
        persist();
    }
}
function getActiveSessionByChannel(channelId) {
    const sessionId = channelSessions.get(channelId);
    if (!sessionId)
        return undefined;
    return sessions.get(sessionId);
}
function createSessionId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
