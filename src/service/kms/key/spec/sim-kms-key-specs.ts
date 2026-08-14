import {
  SimKmsKeySpec,
  SimKmsKeyUsage,
  type SimKmsKeyPairParameters,
} from "./sim-kms-key-spec.js";
import { SimKmsSigningAlgorithm } from "./sim-kms-signing-algorithm.js";

/**
 * The symmetric encryption spec, which is what a key gets when a request names
 * no spec at all.
 */
export const simKmsSymmetricKeySpecName = "SYMMETRIC_DEFAULT";

/**
 * The symmetric encryption key spec itself, which several call sites need
 * directly because it is the default a key gets.
 */
export const simKmsSymmetricKeySpec = new SimKmsKeySpec({
  name: simKmsSymmetricKeySpecName,
  keyUsage: SimKmsKeyUsage.EncryptDecrypt,
  encryptionAlgorithms: [simKmsSymmetricKeySpecName],
});

/**
 * An ECC key spec offers exactly one signing algorithm, the one paired with
 * its curve.
 */
const ecdsa = (
  name: string,
  digest: string,
): readonly SimKmsSigningAlgorithm[] => [
  new SimKmsSigningAlgorithm({ name, digest }),
];

/**
 * Every RSA signing key offers the same six algorithms, in the order KMS lists
 * them: the two padding schemes across the three digests.
 */
const rsaSigningAlgorithms: readonly SimKmsSigningAlgorithm[] = [
  new SimKmsSigningAlgorithm({
    name: "RSASSA_PSS_SHA_256",
    digest: "sha256",
    probabilisticPadding: true,
  }),
  new SimKmsSigningAlgorithm({
    name: "RSASSA_PSS_SHA_384",
    digest: "sha384",
    probabilisticPadding: true,
  }),
  new SimKmsSigningAlgorithm({
    name: "RSASSA_PSS_SHA_512",
    digest: "sha512",
    probabilisticPadding: true,
  }),
  new SimKmsSigningAlgorithm({
    name: "RSASSA_PKCS1_V1_5_SHA_256",
    digest: "sha256",
  }),
  new SimKmsSigningAlgorithm({
    name: "RSASSA_PKCS1_V1_5_SHA_384",
    digest: "sha384",
  }),
  new SimKmsSigningAlgorithm({
    name: "RSASSA_PKCS1_V1_5_SHA_512",
    digest: "sha512",
  }),
];

const signingKeySpec = (
  name: string,
  keyPair: SimKmsKeyPairParameters,
  signingAlgorithms: readonly SimKmsSigningAlgorithm[],
): SimKmsKeySpec =>
  new SimKmsKeySpec({
    name,
    keyUsage: SimKmsKeyUsage.SignVerify,
    keyPair,
    signingAlgorithms,
  });

const ecSigningKeySpec = (
  name: string,
  namedCurve: string,
  signingAlgorithm: string,
  digest: string,
): SimKmsKeySpec =>
  signingKeySpec(
    name,
    { type: "ec", namedCurve },
    ecdsa(signingAlgorithm, digest),
  );

const rsaSigningKeySpec = (modulusLength: number): SimKmsKeySpec =>
  signingKeySpec(
    `RSA_${String(modulusLength)}`,
    { type: "rsa", modulusLength },
    rsaSigningAlgorithms,
  );

/**
 * Every key spec this simulation models, by the name AWS gives it.
 *
 * Real KMS also offers asymmetric encryption, HMAC and key agreement specs,
 * and offers the RSA specs for encryption as well as signing. Those are absent
 * rather than listed, so `CreateKey` refuses them: a key that cannot do what
 * its spec says it does would be worse than no key at all.
 */
export const simKmsKeySpecs: ReadonlyMap<string, SimKmsKeySpec> = new Map(
  [
    simKmsSymmetricKeySpec,
    ecSigningKeySpec("ECC_NIST_P256", "prime256v1", "ECDSA_SHA_256", "sha256"),
    ecSigningKeySpec("ECC_NIST_P384", "secp384r1", "ECDSA_SHA_384", "sha384"),
    ecSigningKeySpec("ECC_NIST_P521", "secp521r1", "ECDSA_SHA_512", "sha512"),
    // secp256k1 signs with SHA-256, the same as the P-256 curve above.
    ecSigningKeySpec("ECC_SECG_P256K1", "secp256k1", "ECDSA_SHA_256", "sha256"),
    rsaSigningKeySpec(2048),
    rsaSigningKeySpec(3072),
    rsaSigningKeySpec(4096),
  ].map((keySpec) => [keySpec.name, keySpec]),
);

/**
 * The names of the key specs this simulation models, for a refusal to list.
 */
export function simKmsKeySpecNames(): readonly string[] {
  return simKmsKeySpecs.keys().toArray();
}
