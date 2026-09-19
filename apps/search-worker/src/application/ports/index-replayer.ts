/**
 * Rebuilds the read model from the event log: stops the search-indexer consumers, moves the group's committed
 * offsets to the earliest retained record, runs `reset` (truncate) while nothing is consuming and resumes.
 */
export abstract class IndexReplayer {
  /** True when the consumer group has committed offsets (it consumed before). */
  abstract hasCommittedProgress(): Promise<boolean>;
  /** Whether a replay is currently running in this process. */
  abstract isReplaying(): boolean;
  /** Resolves once consumers resumed from the earliest offsets; rejects with CONFLICT when a replay is running. */
  abstract replayFromEarliest(reset: () => Promise<void>): Promise<void>;
}
