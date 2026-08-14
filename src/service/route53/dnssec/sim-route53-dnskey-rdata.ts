import { concatenateBytes } from "../dns/wire/dns-bytes.js";
import { SimRoute53InvalidInput } from "../error/sim-route53.error.js";
import {
  simRoute53DnskeyProtocol,
  simRoute53KskFlag,
  simRoute53SigningAlgorithmType,
} from "./sim-route53-dnssec-algorithm.js";

/**
 * An uncompressed elliptic curve point starts with this marker, and the 64
 * bytes after it are the X and Y coordinates DNSSEC publishes.
 */
const uncompressedPointMarker = 0x04;
const p256PointLength = 65;

/**
 * The raw X and Y coordinates inside a DER SubjectPublicKeyInfo.
 *
 * DNSSEC publishes the point on its own, with no ASN.1 around it and no
 * uncompressed-point marker, so the tail of the DER encoding is what is
 * wanted. The marker is checked rather than assumed, since a compressed point
 * would silently produce the wrong key.
 */
export function simRoute53EcPoint(publicKeyDer: Uint8Array): Uint8Array {
  const point = publicKeyDer.subarray(publicKeyDer.length - p256PointLength);

  if (
    point.length !== p256PointLength ||
    point[0] !== uncompressedPointMarker
  ) {
    throw new SimRoute53InvalidInput(
      "The key-signing key's public key is not an uncompressed P-256 point",
    );
  }

  return point.subarray(1);
}

/**
 * The DNSKEY RDATA: flags, protocol, algorithm, then the public key.
 *
 * This is the byte sequence both the key tag and the delegation signer digest
 * are computed over, which is why it is built once and kept.
 */
export function simRoute53DnskeyRdata(point: Uint8Array): Uint8Array {
  const header = Uint8Array.from([
    (simRoute53KskFlag >> 8) & 0xff,
    simRoute53KskFlag & 0xff,
    simRoute53DnskeyProtocol,
    simRoute53SigningAlgorithmType,
  ]);

  return concatenateBytes([header, point]);
}
