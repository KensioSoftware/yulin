interface SimKinesisRecordProperties {
  readonly partitionKey: string;
  readonly explicitHashKey: bigint | undefined;
  readonly data: Uint8Array;
  readonly sequenceNumber: string;
  readonly arrivedAt: Date;
}

/**
 * One record on one shard of one stream.
 *
 * The data is a copy of the bytes the caller put. Real Kinesis serializes a
 * record on the way in, so a producer reusing one buffer for record after
 * record puts a different record each time. Holding the caller's array would
 * make every record on the stream change together as that buffer was refilled.
 *
 * The bytes themselves are carried unchanged. A consumer decoding JSON, Avro or
 * anything else gets what the producer encoded.
 */
export class SimKinesisRecord {
  public readonly partitionKey: string;
  public readonly explicitHashKey: bigint | undefined;
  public readonly data: Uint8Array;
  public readonly sequenceNumber: string;
  public readonly arrivedAt: Date;

  constructor(properties: SimKinesisRecordProperties) {
    this.partitionKey = properties.partitionKey;
    this.explicitHashKey = properties.explicitHashKey;
    this.data = Uint8Array.from(properties.data);
    this.sequenceNumber = properties.sequenceNumber;
    this.arrivedAt = new Date(properties.arrivedAt);
  }
}
