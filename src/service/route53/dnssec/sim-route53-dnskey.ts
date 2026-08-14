import { createHash } from "node:crypto";
import { encodeDnsName } from "../dns/wire/dns-name.js";
import { concatenateBytes } from "../dns/wire/dns-bytes.js";
import { simRoute53DnskeyKeyTag } from "./sim-route53-dnskey-tag.js";
import {
  simRoute53DnskeyRdata,
  simRoute53EcPoint,
} from "./sim-route53-dnskey-rdata.js";
import {
  simRoute53DigestAlgorithmType,
  simRoute53DnskeyProtocol,
  simRoute53KskFlag,
  simRoute53SigningAlgorithmType,
} from "./sim-route53-dnssec-algorithm.js";

/**
 * The DNSKEY a key-signing key publishes, derived from its KMS public key.
 *
 * Everything here is computed rather than invented, so the DS record a test
 * reads is the DS record the zone's registrar would need. Two zones on two
 * keys get two different ones, and a key tag that does not match its public
 * key would be a bug rather than a detail nobody checks.
 */
export class SimRoute53Dnskey {
  /**
   * The public key, base64 encoded as RFC 4034 requires.
   */
  public readonly publicKey: string;

  /**
   * The key tag, computed by the RFC 4034 Appendix B algorithm.
   */
  public readonly keyTag: number;

  private readonly rdata: Uint8Array;

  constructor(publicKeyDer: Uint8Array) {
    const point = simRoute53EcPoint(publicKeyDer);

    this.publicKey = Buffer.from(point).toString("base64");
    this.rdata = simRoute53DnskeyRdata(point);
    this.keyTag = simRoute53DnskeyKeyTag(this.rdata);
  }

  /**
   * The delegation signer digest over a zone's owner name and this DNSKEY.
   *
   * Uppercase hex, which is the form Route53 returns and the form a registrar
   * expects in a DS record.
   */
  digestValue(zoneName: string): string {
    const ownerName = encodeDnsName(zoneName.toLowerCase());

    return createHash("sha256")
      .update(concatenateBytes([ownerName, this.rdata]))
      .digest("hex")
      .toUpperCase();
  }

  /**
   * The DS record a registrar is given, as Route53 formats it.
   */
  dsRecord(zoneName: string): string {
    return [
      this.keyTag,
      simRoute53SigningAlgorithmType,
      simRoute53DigestAlgorithmType,
      this.digestValue(zoneName),
    ].join(" ");
  }

  /**
   * The DNSKEY record this key publishes, as Route53 formats it.
   */
  dnskeyRecord(): string {
    return [
      simRoute53KskFlag,
      simRoute53DnskeyProtocol,
      simRoute53SigningAlgorithmType,
      this.publicKey,
    ].join(" ");
  }
}
