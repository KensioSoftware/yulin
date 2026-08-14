import {
  SimRoute53DnssecNotFound,
  SimRoute53KeySigningKeyAlreadyExists,
  SimRoute53NoActiveKeySigningKey,
  SimRoute53NoSuchKeySigningKey,
} from "../error/sim-route53.error.js";
import type { SimRoute53KeySigningKey } from "./sim-route53-key-signing-key.js";

/**
 * Whether a zone is being signed.
 *
 * Real Route53 also reports DELETING while signing is being taken off, and two
 * statuses for a zone that needs attention. Nothing here leaves a zone in any
 * of those, so a zone is signing or it is not.
 */
export const SimRoute53ServeSignature = {
  Signing: "SIGNING",
  NotSigning: "NOT_SIGNING",
} as const;

export type SimRoute53ServeSignature =
  (typeof SimRoute53ServeSignature)[keyof typeof SimRoute53ServeSignature];

/**
 * The DNSSEC state of one hosted zone: its key-signing keys, and whether the
 * zone is signed with them.
 *
 * The two are separate on real Route53 and stay separate here. Adding a
 * key-signing key does not start signing, and stopping signing leaves the keys
 * in place, which is what makes it possible to prepare a zone for DNSSEC
 * before the DS record is published.
 */
export class SimRoute53ZoneDnssec {
  private readonly keySigningKeys = new Map<string, SimRoute53KeySigningKey>();
  #serveSignature: SimRoute53ServeSignature =
    SimRoute53ServeSignature.NotSigning;

  /**
   * Whether the zone is being signed.
   */
  get serveSignature(): SimRoute53ServeSignature {
    return this.#serveSignature;
  }

  /**
   * Every key-signing key on the zone, in the order they were added.
   */
  keys(): readonly SimRoute53KeySigningKey[] {
    return this.keySigningKeys.values().toArray();
  }

  /**
   * Add a key-signing key to the zone.
   *
   * A name is unique within the zone, and so is the KMS key behind it: real
   * Route53 refuses both, because two keys sharing either would be
   * indistinguishable in the zone's DNSKEY set.
   */
  add(keySigningKey: SimRoute53KeySigningKey): void {
    if (this.keySigningKeys.has(keySigningKey.name)) {
      throw new SimRoute53KeySigningKeyAlreadyExists(
        `Key signing key ${keySigningKey.name} already exists in this hosted zone`,
      );
    }

    if (this.keys().some((key) => key.kmsArn === keySigningKey.kmsArn)) {
      throw new SimRoute53KeySigningKeyAlreadyExists(
        `Key signing key ${keySigningKey.name} uses KMS key ${keySigningKey.kmsArn}, which another key signing key in this hosted zone already uses`,
      );
    }

    this.keySigningKeys.set(keySigningKey.name, keySigningKey);
  }

  /**
   * Find a key-signing key by name, or refuse an unknown one.
   */
  require(name: string): SimRoute53KeySigningKey {
    const keySigningKey = this.keySigningKeys.get(name);

    if (keySigningKey === undefined) {
      throw new SimRoute53NoSuchKeySigningKey(
        `No key signing key named ${name} in this hosted zone`,
      );
    }

    return keySigningKey;
  }

  /**
   * Remove a key-signing key, refusing one that is still signing.
   */
  remove(name: string): void {
    this.require(name).requireRemovable();
    this.keySigningKeys.delete(name);
  }

  /**
   * Start signing the zone.
   *
   * A zone with no active key-signing key has nothing to sign with, which real
   * Route53 refuses rather than reporting a signed zone no resolver could
   * validate.
   */
  enableSigning(): void {
    if (this.keys().every((key) => !key.isActive)) {
      throw new SimRoute53NoActiveKeySigningKey(
        "This hosted zone has no ACTIVE key signing key to sign with",
      );
    }

    this.#serveSignature = SimRoute53ServeSignature.Signing;
  }

  /**
   * Refuse deletion of the Hosted Zone while it is still being signed.
   *
   * Real Route53 will not delete a signed zone: DNSSEC has to be disabled
   * first, so the DS record at the parent stops pointing at a zone that has
   * gone.
   */
  assertZoneDeletable(): void {
    if (this.#serveSignature === SimRoute53ServeSignature.Signing) {
      throw new SimRoute53DnssecNotFound(
        "This hosted zone is signed and cannot be deleted: disable DNSSEC first",
      );
    }
  }

  /**
   * Stop signing the zone, leaving its key-signing keys in place.
   */
  disableSigning(): void {
    if (this.#serveSignature === SimRoute53ServeSignature.NotSigning) {
      throw new SimRoute53DnssecNotFound(
        "This hosted zone is not signed, so signing cannot be disabled",
      );
    }

    this.#serveSignature = SimRoute53ServeSignature.NotSigning;
  }
}
