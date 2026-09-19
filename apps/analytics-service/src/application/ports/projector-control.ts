/** Control over the analytics-projector consumer group (implemented on the Kafka consumer and admin clients). */
export abstract class ProjectorControl {
  /** Stops consuming after the in-flight record settles and leaves the group. */
  abstract pause(): Promise<void>;
  /** Moves the group's committed offsets to the earliest retained offset of every topic it reads. Group must be idle. */
  abstract resetToEarliest(): Promise<void>;
  /** Starts consuming again (no-op while the process shuts down). */
  abstract resume(): Promise<void>;
  /** Records behind the log end, summed over the group's partitions; null when the broker cannot be asked in time. */
  abstract lag(): Promise<number | null>;
}
