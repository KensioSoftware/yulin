/**
 * Minimal metadata shape for simulated Route53 errors.
 */
export interface SimRoute53ErrorMetadata {
  readonly httpStatusCode?: number;
}

/**
 * Base class for simulated Route53 errors.
 */
export class SimRoute53Error extends Error {
  constructor(
    message: string,
    public readonly $metadata: SimRoute53ErrorMetadata = {},
  ) {
    super(message);
  }
}

/**
 * Simulated Route53 NoSuchHostedZone error.
 */
export class SimRoute53NoSuchHostedZone extends SimRoute53Error {
  public override readonly name = "NoSuchHostedZone";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated Route53 HostedZoneAlreadyExists error.
 */
export class SimRoute53HostedZoneAlreadyExists extends SimRoute53Error {
  public override readonly name = "HostedZoneAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
