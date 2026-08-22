/**
 * The AWS::Kinesis::Stream properties this simulation acts on.
 */
export const streamNamePropertyName = "Name";

export const shardCountPropertyName = "ShardCount";

export const retentionPropertyName = "RetentionPeriodHours";

export const streamModeDetailsPropertyName = "StreamModeDetails";

export const tagsPropertyName = "Tags";

/**
 * Real AWS::Kinesis::Stream properties this simulation does not model, and why.
 *
 * Encryption changes nothing a test can observe here: every record is handed
 * back as it was put, and no key is ever asked for. The property is recorded
 * against the Resource rather than refused, so a template that encrypts its
 * streams still deploys and the omission is somewhere a test can find it.
 */
export const unsimulatedPropertyReasons: ReadonlyMap<string, string> = new Map([
  [
    "StreamEncryption",
    "server-side encryption is not simulated, and records are handed back as " +
      "they were put",
  ],
  [
    "DesiredShardLevelMetrics",
    "shard-level CloudWatch metrics are not simulated",
  ],
]);
