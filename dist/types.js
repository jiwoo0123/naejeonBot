"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rollPickOrder = rollPickOrder;
exports.resetForRematch = resetForRematch;
exports.createSession = createSession;
function rollPickOrder(session) {
    const [c1, c2] = session.captains;
    let roll1;
    let roll2;
    do {
        roll1 = Math.floor(Math.random() * 100) + 1;
        roll2 = Math.floor(Math.random() * 100) + 1;
    } while (roll1 === roll2);
    session.pickOrderRolls = { [c1]: roll1, [c2]: roll2 };
    session.pickOrder = roll1 > roll2 ? [c1, c2] : [c2, c1];
}
function resetForRematch(session) {
    session.state = "selecting_captains";
    session.isRematch = true;
    session.captainCandidates = [];
    session.captains = [];
    session.pickOrder = [];
    session.teams = {};
    session.remaining = [];
    session.currentPickerIndex = 0;
    session.draftSelections = [];
    session.redTeamCaptainId = null;
    session.pickOrderRolls = {};
}
function createSession(id, channelId, messageId, hostId) {
    return {
        id,
        channelId,
        messageId,
        hostId,
        state: "registering",
        participants: [],
        captainCandidates: [],
        captains: [],
        pickOrder: [],
        teams: {},
        remaining: [],
        currentPickerIndex: 0,
        draftSelections: [],
        redTeamCaptainId: null,
        isRematch: false,
        pickOrderRolls: {},
    };
}
