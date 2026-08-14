import { SimRoute53InvalidKeySigningKeyStatus } from "../error/sim-route53.error.js";
import { SimRoute53Dnskey } from "./sim-route53-dnskey.js";
import {
  simRoute53DigestAlgorithmMnemonic,
  simRoute53DigestAlgorithmType,
  simRoute53KskFlag,
  simRoute53SigningAlgorithmMnemonic,
  simRoute53SigningAlgorithmType,
} from "./sim-route53-dnssec-algorithm.js";

/**
 * The statuses a key-signing key can hold here.
 *
 * Real Route53 also has DELETING and the two failure statuses, which describe
 * a key mid-operation or a zone that needs attention. Nothing in this
 * simulation produces either, so a key is one of these two.
 */
export const SimRoute53KeySigningKeyStatus = {
  Active: "ACTIVE",
  Inactive: "INACTIVE",
} as const;

export type SimRoute53KeySigningKeyStatus =
  (typeof SimRoute53KeySigningKeyStatus)[keyof typeof SimRoute53KeySigningKeyStatus];

interface SimRoute53KeySigningKeyProperties {
  readonly name: string;
  readonly kmsArn: string;
  readonly hostedZoneId: string;
  readonly zoneName: string;
  readonly publicKeyDer: Uint8Array;
  readonly status: SimRoute53KeySigningKeyStatus;
  readonly createdDate: Date;
}

/**
 * The AWS-shaped view of a key-signing key, as GetDNSSEC returns it.
 */
export interface SimRoute53KeySigningKeyView {
  readonly Name: string;
  readonly KmsArn: string;
  readonly Flag: number;
  readonly SigningAlgorithmMnemonic: string;
  readonly SigningAlgorithmType: number;
  readonly DigestAlgorithmMnemonic: string;
  readonly DigestAlgorithmType: number;
  readonly KeyTag: number;
  readonly DigestValue: string;
  readonly PublicKey: string;
  readonly DSRecord: string;
  readonly DNSKEYRecord: string;
  readonly Status: SimRoute53KeySigningKeyStatus;
  readonly CreatedDate: Date;
  readonly LastModifiedDate: Date;
}

/**
 * A simulated Route53 key-signing key.
 *
 * The key itself lives in KMS. What is held here is what Route53 adds: a name
 * within the zone, a status, and the DNSSEC parameters derived from the KMS
 * key's public key at the moment the key-signing key was created. Real Route53
 * derives them once in the same way, which is why rotating the KMS key is not
 * a thing you can do to an existing key-signing key.
 */
export class SimRoute53KeySigningKey {
  public readonly name: string;
  public readonly kmsArn: string;

  /**
   * The Hosted Zone this key belongs to. A key-signing key is only ever
   * identified alongside its zone, which is why its CloudFormation Ref is the
   * two joined together.
   */
  public readonly hostedZoneId: string;

  private readonly zoneName: string;
  private readonly dnskey: SimRoute53Dnskey;
  private readonly createdDate: Date;
  #status: SimRoute53KeySigningKeyStatus;
  #lastModifiedDate: Date;

  constructor(properties: SimRoute53KeySigningKeyProperties) {
    this.name = properties.name;
    this.kmsArn = properties.kmsArn;
    this.hostedZoneId = properties.hostedZoneId;
    this.zoneName = properties.zoneName;
    this.dnskey = new SimRoute53Dnskey(properties.publicKeyDer);
    this.createdDate = properties.createdDate;
    this.#status = properties.status;
    this.#lastModifiedDate = properties.createdDate;
  }

  /**
   * Whether this key is being used to sign the zone.
   */
  get isActive(): boolean {
    return this.#status === SimRoute53KeySigningKeyStatus.Active;
  }

  /**
   * The DS record this key's registrar is given.
   */
  get dsRecord(): string {
    return this.dnskey.dsRecord(this.zoneName);
  }

  /**
   * Start signing with this key.
   */
  activate(modifiedDate: Date): void {
    this.setStatus(SimRoute53KeySigningKeyStatus.Active, modifiedDate);
  }

  /**
   * Stop signing with this key, leaving it on the zone.
   */
  deactivate(modifiedDate: Date): void {
    this.setStatus(SimRoute53KeySigningKeyStatus.Inactive, modifiedDate);
  }

  /**
   * Refuse removal of a key that is still signing.
   *
   * Real Route53 will not delete an active key-signing key, because doing so
   * would leave the zone signed with a key resolvers can no longer find.
   */
  requireRemovable(): void {
    if (this.isActive) {
      throw new SimRoute53InvalidKeySigningKeyStatus(
        `Key signing key ${this.name} is ACTIVE and cannot be deleted: deactivate it first`,
      );
    }
  }

  /**
   * Describe this key the way GetDNSSEC reports it.
   */
  describe(): SimRoute53KeySigningKeyView {
    return {
      Name: this.name,
      KmsArn: this.kmsArn,
      Flag: simRoute53KskFlag,
      SigningAlgorithmMnemonic: simRoute53SigningAlgorithmMnemonic,
      SigningAlgorithmType: simRoute53SigningAlgorithmType,
      DigestAlgorithmMnemonic: simRoute53DigestAlgorithmMnemonic,
      DigestAlgorithmType: simRoute53DigestAlgorithmType,
      KeyTag: this.dnskey.keyTag,
      DigestValue: this.dnskey.digestValue(this.zoneName),
      PublicKey: this.dnskey.publicKey,
      DSRecord: this.dsRecord,
      DNSKEYRecord: this.dnskey.dnskeyRecord(),
      Status: this.#status,
      CreatedDate: new Date(this.createdDate),
      LastModifiedDate: new Date(this.#lastModifiedDate),
    };
  }

  private setStatus(
    status: SimRoute53KeySigningKeyStatus,
    modifiedDate: Date,
  ): void {
    this.#status = status;
    this.#lastModifiedDate = modifiedDate;
  }
}
