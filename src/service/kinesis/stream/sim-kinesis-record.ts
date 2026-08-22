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
 * The data is held as the bytes the caller put, untouched. Real Kinesis carries
 * whatever it was given and hands the same bytes back, so a consumer decoding
 * JSON, Avro or anything else gets what the producer encoded.
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
    this.data = properties.data;
    this.sequenceNumber = properties.sequenceNumber;
    this.arrivedAt = properties.arrivedAt;
  }
}
