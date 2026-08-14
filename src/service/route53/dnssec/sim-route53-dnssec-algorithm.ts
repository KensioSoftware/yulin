/**
 * The DNSSEC parameters of a Route53 key-signing key.
 *
 * Route53 only accepts an ECC_NIST_P256 customer managed key, so there is one
 * algorithm here rather than a table: ECDSA with SHA-256, algorithm 13, and
 * the SHA-256 delegation signer digest, algorithm 2. A key-signing key always
 * carries flag 257, the secure entry point.
 */
export const simRoute53KskFlag = 257;
export const simRoute53SigningAlgorithmMnemonic = "ECDSAP256SHA256";
export const simRoute53SigningAlgorithmType = 13;
export const simRoute53DigestAlgorithmMnemonic = "SHA-256";
export const simRoute53DigestAlgorithmType = 2;

/**
 * The DNSKEY protocol field, which RFC 4034 fixes at 3.
 */
export const simRoute53DnskeyProtocol = 3;
