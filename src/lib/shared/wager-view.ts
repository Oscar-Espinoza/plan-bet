import type { Market } from "./markets";
import type { WagerClosedReason } from "./wager-copy";

/** Fields the slip and /you actually render. No ledger internals. */
export type SlipWager = {
  id: string;
  routeId: string;
  selectionId: string;
  selectionLabel: string;
  marketLabel: string;
  line?: number;
  price: number;
  stake: number;
  potentialReturn: number;
  placedAt: string;
  matchup: string;
  competition: string;
  settlement?: {
    outcome: "won" | "lost" | "void";
    returned: number;
    finalScore?: { homeScore: number; awayScore: number };
  };
};

export type RecordSliceView = {
  key: string;
  label: string;
  won: number;
  lost: number;
  voided: number;
};

export type WagerPanelState =
  | { kind: "unavailable" }
  | { kind: "closed"; reason: WagerClosedReason }
  | {
      kind: "open";
      markets: Market[];
      balance: number;
      groups: { id: string; name: string }[];
      byMarket: RecordSliceView[];
    };

export type WagerPanelData = {
  signedIn: true;
  routeId: string;
  state: WagerPanelState;
  wagers: SlipWager[];
  groupPicks: {
    wager: SlipWager;
    userName: string | null;
    groupName: string;
  }[];
};

export type Standing = {
  balance: number;
  won: number;
  lost: number;
  voided: number;
  net: number;
};

export type OpenWagersView = {
  count: number;
  items: SlipWager[];
};

export type HistoryView = {
  items: SlipWager[];
  hasMore: boolean;
};
