"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadPartySessions = loadPartySessions;
exports.getParty = getParty;
exports.saveParty = saveParty;
exports.deleteParty = deleteParty;
exports.getActivePartiesByGuild = getActivePartiesByGuild;
exports.createPartySessionId = createPartySessionId;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sessions = new Map();
const DATA_DIR = path_1.default.join(process.cwd(), "data");
const SESSION_FILE = path_1.default.join(DATA_DIR, "party-sessions.json");
function persist() {
    const data = {
        sessions: Object.fromEntries(sessions),
    };
    fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
    fs_1.default.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), "utf-8");
}
function loadPartySessions() {
    if (!fs_1.default.existsSync(SESSION_FILE))
        return;
    try {
        const data = JSON.parse(fs_1.default.readFileSync(SESSION_FILE, "utf-8"));
        sessions.clear();
        for (const [id, session] of Object.entries(data.sessions ?? {})) {
            sessions.set(id, session);
        }
        console.log(`파티 세션 ${sessions.size}개 복구됨`);
    }
    catch (error) {
        console.error("파티 세션 파일 로드 실패:", error);
    }
}
function getParty(sessionId) {
    return sessions.get(sessionId);
}
function saveParty(session) {
    sessions.set(session.id, session);
    persist();
}
function deleteParty(sessionId) {
    sessions.delete(sessionId);
    persist();
}
function getActivePartiesByGuild(guildId) {
    return [...sessions.values()].filter((s) => s.guildId === guildId && s.state === "open");
}
function createPartySessionId() {
    return `pt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
