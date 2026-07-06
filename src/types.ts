export type NaejeonState =
  | "registering"
  | "selecting_captains"
  | "drafting"
  | "complete"
  | "cancelled"
  | "ended";

export interface NaejeonSession {
  id: string;
  channelId: string;
  messageId: string;
  hostId: string;
  state: NaejeonState;
  participants: string[];
  captainCandidates: string[];
  captains: string[];
  pickOrder: string[];
  teams: Record<string, string[]>;
  remaining: string[];
  currentPickerIndex: number;
  draftSelections: string[];
  redTeamCaptainId: string | null;
  isRematch: boolean;
  pickOrderRolls: Record<string, number>;
}

export function rollPickOrder(session: NaejeonSession): void {
  const [c1, c2] = session.captains;
  let roll1: number;
  let roll2: number;

  do {
    roll1 = Math.floor(Math.random() * 100) + 1;
    roll2 = Math.floor(Math.random() * 100) + 1;
  } while (roll1 === roll2);

  session.pickOrderRolls = { [c1]: roll1, [c2]: roll2 };
  session.pickOrder = roll1 > roll2 ? [c1, c2] : [c2, c1];
}

export function resetForRematch(session: NaejeonSession): void {
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

export function createSession(
  id: string,
  channelId: string,
  messageId: string,
  hostId: string
): NaejeonSession {
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
