/**
 * Simulated S3 object metadata.
 */
export class SimS3ObjectMetadata {
  constructor(public readonly values: Record<string, string> = {}) {}
}

/**
 * Simulated S3 object.
 */
export class SimS3Object {
  constructor(
    public readonly key: string,
    public readonly body: Buffer = Buffer.alloc(0),
    public readonly metadata: SimS3ObjectMetadata = new SimS3ObjectMetadata(),
  ) {}
}
