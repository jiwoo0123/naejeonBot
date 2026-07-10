"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPartySession = createPartySession;
function createPartySession(id, guildId, channelId, messageId, hostId, title, content, targetCount) {
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
