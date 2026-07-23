/**
 * Simulated S3 object metadata.
 */
export class SimS3ObjectMetadata {
  constructor(public readonly values: Record<string, string> = {}) {}
}

interface SimS3ObjectProperties {
  readonly key?: string;
  readonly body?: Buffer;
  readonly metadata?: SimS3ObjectMetadata;
}

/**
 * Simulated S3 object.
 */
export class SimS3Object {
  public readonly key: string;
  public readonly body: Buffer;
  public readonly metadata: SimS3ObjectMetadata;

  constructor(properties: SimS3ObjectProperties = {}) {
    const {
      key = "object.json",
      body = Buffer.alloc(0),
      metadata = new SimS3ObjectMetadata(),
    } = properties;

    this.key = key;
    this.body = body;
    this.metadata = metadata;
  }
}
