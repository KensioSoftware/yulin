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
 * Simulated Route53 HostedZoneNotEmpty error.
 *
 * Real Route53 refuses to delete a Hosted Zone that still holds records,
 * counting everything except the NS and SOA records it created with the zone.
 * Simulated zones are created without those two, so here every remaining
 * record counts.
 */
export class SimRoute53HostedZoneNotEmpty extends SimRoute53Error {
  public override readonly name = "HostedZoneNotEmpty";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Route53 InvalidInput error.
 */
export class SimRoute53InvalidInput extends SimRoute53Error {
  public override readonly name = "InvalidInput";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Route53 HostedZoneAlreadyExists error.
 */
export class SimRoute53HostedZoneAlreadyExists extends SimRoute53Error {
  public override readonly name = "HostedZoneAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}
