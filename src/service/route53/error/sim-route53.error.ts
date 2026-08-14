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

/**
 * Simulated Route53 InvalidKeySigningKeyStatus error.
 *
 * Real Route53 reports a key-signing key that is in the wrong state for what
 * was asked of it this way, such as deleting one that is still active.
 */
export class SimRoute53InvalidKeySigningKeyStatus extends SimRoute53Error {
  public override readonly name = "InvalidKeySigningKeyStatus";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Route53 NoSuchKeySigningKey error.
 */
export class SimRoute53NoSuchKeySigningKey extends SimRoute53Error {
  public override readonly name = "NoSuchKeySigningKey";

  constructor(message: string) {
    super(message, { httpStatusCode: 404 });
  }
}

/**
 * Simulated Route53 KeySigningKeyAlreadyExists error.
 */
export class SimRoute53KeySigningKeyAlreadyExists extends SimRoute53Error {
  public override readonly name = "KeySigningKeyAlreadyExists";

  constructor(message: string) {
    super(message, { httpStatusCode: 409 });
  }
}

/**
 * Simulated Route53 InvalidKMSArn error.
 *
 * Route53 checks the customer managed key a key-signing key names before it
 * creates one: the key has to exist, be enabled, and be an ECC_NIST_P256
 * SIGN_VERIFY key. This is how it reports a key that is not.
 */
export class SimRoute53InvalidKmsArn extends SimRoute53Error {
  public override readonly name = "InvalidKMSArn";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Route53 DNSSECNotFound error.
 *
 * Real Route53 reports an attempt to stop signing a zone that is not signed
 * this way.
 */
export class SimRoute53DnssecNotFound extends SimRoute53Error {
  public override readonly name = "DNSSECNotFound";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}

/**
 * Simulated Route53 KeySigningKeyWithActiveStatusNotFound error.
 *
 * Enabling DNSSEC signing needs an active key-signing key to sign with, and
 * this is what real Route53 answers when the zone has none.
 */
export class SimRoute53NoActiveKeySigningKey extends SimRoute53Error {
  public override readonly name = "KeySigningKeyWithActiveStatusNotFound";

  constructor(message: string) {
    super(message, { httpStatusCode: 400 });
  }
}
