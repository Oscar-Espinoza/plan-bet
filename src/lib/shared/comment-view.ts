/** Fields the game thread renders. Kept out of server contracts for the client bundle. */
export type CommentVoteKind = "shame" | "slander";

export type GameCommentPhase = "before" | "after";

export type GameCommentView = {
  id: string;
  parentCommentId?: string | null;
  groupId: string;
  userId: string;
  authorName: string | null;
  authorSelectionLabel: string;
  phase: GameCommentPhase;
  body: string;
  createdAt: string;
  shameVotes: number;
  slanderVotes: number;
  viewerVoted: CommentVoteKind[];
};

export type CommentThreadView = {
  groupId: string;
  groupName: string;
  comments: GameCommentView[];
  hasCommented: boolean;
  postingPhase: GameCommentPhase | null;
  viewerSelectionLabel: string | null;
  pins: { shame?: string; slander?: string };
};

export type SocialDiscussionView = {
  threads: CommentThreadView[];
};
