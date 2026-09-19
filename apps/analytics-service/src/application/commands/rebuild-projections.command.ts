/** Replays the Kafka log into an empty read model: pause the group, reset offsets to earliest, truncate, resume. */
export class RebuildProjectionsCommand {
  constructor(readonly requestedBy: string | null) {}
}
