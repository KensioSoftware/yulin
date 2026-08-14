import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimRoute53Dnskey } from "./sim-route53-dnskey.js";
import { SimRoute53InvalidInput } from "../error/sim-route53.error.js";

/**
 * The ECDSA P-256 example zone from RFC 6605 Appendix A.1, which publishes a
 * DNSKEY, its key tag and the DS record derived from it. Checking against a
 * published vector is the only way to know the key tag and digest here are
 * the ones a resolver would compute, rather than being self-consistently
 * wrong.
 */
const rfc6605PublicKey =
  // oxlint-disable-next-line no-secrets/no-secrets -- a published public key
  "GojIhhXUN/u4v54ZQqGSnyhWJwaubCvTmeexv7bR6edbkrSqQpF64cYbcB7wNcP+e+MAnLr+Wi9xMWyQLc8NAA==";
const rfc6605KeyTag = 55_648;
const rfc6605Digest =
  "B4C8C1FE2E7477127B27115656AD6256F424625BF5C1E2770CE6D6E37DF61D17";

/**
 * The DER SubjectPublicKeyInfo header every P-256 public key carries, which is
 * what turns a raw point back into the encoding GetPublicKey returns.
 */
const p256SpkiHeader = Buffer.from(
  "3059301306072a8648ce3d020106082a8648ce3d03010703420004",
  "hex",
);

function derPublicKey(rawPoint: string): Uint8Array {
  return Uint8Array.from(
    Buffer.concat([p256SpkiHeader, Buffer.from(rawPoint, "base64")]),
  );
}

describe("Route53 DNSKEY derivation", () => {
  it("computes the key tag of a published DNSKEY", () => {
    // Given the P-256 public key RFC 6605 publishes for example.net.
    const dnskey = new SimRoute53Dnskey(derPublicKey(rfc6605PublicKey));

    // When its key tag is read, then it is the tag the RFC gives.
    assertIdentical(dnskey.keyTag, rfc6605KeyTag);
  });

  it("computes the DS digest of a published DNSKEY", () => {
    // Given the same key, and the zone it belongs to.
    const dnskey = new SimRoute53Dnskey(derPublicKey(rfc6605PublicKey));

    // When the delegation signer digest is computed, then it matches the DS
    // record the RFC publishes.
    assertIdentical(dnskey.digestValue("example.net."), rfc6605Digest);
    assertIdentical(
      dnskey.dsRecord("example.net."),
      `${String(rfc6605KeyTag)} 13 2 ${rfc6605Digest}`,
    );
  });

  it("publishes the public key it was given", () => {
    // Given the same key.
    const dnskey = new SimRoute53Dnskey(derPublicKey(rfc6605PublicKey));

    // When the DNSKEY record is read, then it carries the key in the base64
    // form RFC 4034 requires.
    assertIdentical(dnskey.publicKey, rfc6605PublicKey);
    assertIdentical(dnskey.dnskeyRecord(), `257 3 13 ${rfc6605PublicKey}`);
  });

  it("takes an owner name however it is cased", () => {
    // Given the same key.
    const dnskey = new SimRoute53Dnskey(derPublicKey(rfc6605PublicKey));

    // When the digest is computed over a mixed-case zone name, then it is the
    // same digest, because DNSSEC digests the canonical lowercase name.
    assertIdentical(dnskey.digestValue("Example.NET."), rfc6605Digest);
  });

  it("refuses a public key that is not a P-256 point", () => {
    // Given a public key too short to hold an uncompressed P-256 point.
    // When a DNSKEY is derived from it, then it is refused rather than
    // producing a key tag over the wrong bytes.
    const error = assertThrowsError(
      () => new SimRoute53Dnskey(Uint8Array.from([1, 2, 3])),
    );

    assertInstanceOf(error, SimRoute53InvalidInput);
  });
});
