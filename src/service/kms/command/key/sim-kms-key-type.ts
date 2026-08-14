import {
  SimKmsInvalidKeyUsageException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";
import {
  SimKmsKeyUsage,
  type SimKmsKeySpec,
} from "../../key/spec/sim-kms-key-spec.js";
import {
  simKmsKeySpecNames,
  simKmsKeySpecs,
  simKmsSymmetricKeySpecName,
} from "../../key/spec/sim-kms-key-specs.js";

const kmsOrigin = "AWS_KMS";

/**
 * The key usages this simulation has key specs for.
 */
const simKmsKeyUsages: ReadonlySet<string> = new Set([
  SimKmsKeyUsage.EncryptDecrypt,
  SimKmsKeyUsage.SignVerify,
]);

/**
 * Resolves the key spec a CreateKey request asks for.
 *
 * A key spec and key usage pair says what the key is, so a pair this
 * simulation does not model is refused rather than substituted: asymmetric
 * encryption, HMAC and key agreement keys all behave differently enough that a
 * signing key or a symmetric one standing in for them would make a passing
 * test meaningless. Imported key material is refused for the same reason.
 */
export class SimKmsKeyType {
  /**
   * Resolve a requested key type, or refuse one this simulation does not
   * model.
   */
  require(
    keyUsage: string | undefined,
    keySpec: string | undefined,
    origin: string | undefined,
  ): SimKmsKeySpec {
    this.requireSimulatedOrigin(origin);
    this.requireSimulatedKeyUsage(keyUsage);

    const spec = this.requireSimulatedSpec(
      keySpec ?? simKmsSymmetricKeySpecName,
    );

    this.requireSpecAllowsUsage(spec, keyUsage, keySpec);

    return spec;
  }

  /**
   * Refuse a key usage no simulated key spec has.
   *
   * HMAC and key agreement keys are the two this rules out. Neither has a spec
   * here at all, so saying the usage is unsimulated is more use than sending
   * the caller looking for a spec that would allow it.
   */
  private requireSimulatedKeyUsage(keyUsage: string | undefined): void {
    if (keyUsage === undefined || simKmsKeyUsages.has(keyUsage)) {
      return;
    }

    throw new SimKmsInvalidKeyUsageException(
      `KeyUsage '${keyUsage}' is not simulated: simulated KMS creates ${[...simKmsKeyUsages].join(" and ")} keys`,
    );
  }

  /**
   * Refuse key material this simulation does not generate itself.
   */
  private requireSimulatedOrigin(origin: string | undefined): void {
    if (origin !== undefined && origin !== kmsOrigin) {
      throw new SimKmsValidationException(
        `Origin '${origin}' is not simulated: simulated KMS generates its own key material`,
      );
    }
  }

  /**
   * Resolve a key spec name, or refuse one this simulation does not create.
   */
  private requireSimulatedSpec(keySpecName: string): SimKmsKeySpec {
    const spec = simKmsKeySpecs.get(keySpecName);

    if (spec === undefined) {
      throw new SimKmsInvalidKeyUsageException(
        `KeySpec '${keySpecName}' is not simulated: simulated KMS creates ${simKmsKeySpecNames().join(", ")} keys`,
      );
    }

    return spec;
  }

  /**
   * Refuse a key usage the resolved spec does not have here.
   *
   * Real KMS offers the RSA specs for encryption as well as signing, and
   * offers no spec at all for a `SIGN_VERIFY` key that names none. Both of
   * those come out here, and the two need different explanations, so the
   * refusal says which case it is rather than repeating the pair back.
   */
  private requireSpecAllowsUsage(
    spec: SimKmsKeySpec,
    keyUsage: string | undefined,
    requestedKeySpec: string | undefined,
  ): void {
    if (keyUsage === undefined || keyUsage === spec.keyUsage) {
      return;
    }

    if (requestedKeySpec === undefined) {
      throw new SimKmsInvalidKeyUsageException(
        `KeyUsage '${keyUsage}' needs a KeySpec: the default ${simKmsSymmetricKeySpecName} spec is ${spec.keyUsage} only`,
      );
    }

    throw new SimKmsInvalidKeyUsageException(
      `KeyUsage '${keyUsage}' with KeySpec '${spec.name}' is not simulated: simulated KMS creates ${spec.name} keys for ${spec.keyUsage}`,
    );
  }
}
