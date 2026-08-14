import type { SimKmsKey } from "../../../kms/key/sim-kms-key.js";
import type { SimKmsKeyResolver } from "../../../kms/registry/sim-kms-registry.js";
import { SimKmsKeyUsage } from "../../../kms/key/spec/sim-kms-key-spec.js";
import { SimRoute53InvalidKmsArn } from "../../error/sim-route53.error.js";

/**
 * The one key spec Route53 will build a key-signing key on.
 */
const requiredKeySpec = "ECC_NIST_P256";

interface SimRoute53KskKmsKeyProperties {
  readonly kmsKeys?: SimKmsKeyResolver | undefined;
}

/**
 * Finds and checks the customer managed key behind a key-signing key.
 *
 * Real Route53 is specific about this key: it has to be an enabled
 * ECC_NIST_P256 key whose usage is sign and verify. Checking it here is what
 * makes a stack that names the wrong key fail in this simulation rather than
 * on the deployment, which is the whole point of deploying it here first.
 */
export class SimRoute53KskKmsKey {
  private readonly kmsKeys: SimKmsKeyResolver | undefined;

  constructor(properties: SimRoute53KskKmsKeyProperties) {
    this.kmsKeys = properties.kmsKeys;
  }

  /**
   * Resolve the KMS key an ARN names, or refuse it.
   */
  require(keyManagementServiceArn: string | undefined): SimKmsKey {
    if (
      keyManagementServiceArn === undefined ||
      keyManagementServiceArn.length === 0
    ) {
      throw new SimRoute53InvalidKmsArn(
        "KeyManagementServiceArn is required to create a key signing key",
      );
    }

    const key = this.resolve(keyManagementServiceArn);

    if (key === undefined) {
      throw new SimRoute53InvalidKmsArn(
        `No simulated KMS key at ${keyManagementServiceArn}: a key signing key needs a customer managed key that exists`,
      );
    }

    this.requireUsable(key);

    return key;
  }

  private resolve(keyManagementServiceArn: string): SimKmsKey | undefined {
    if (this.kmsKeys === undefined) {
      throw new SimRoute53InvalidKmsArn(
        "This simulated Route53 has no simulated KMS to resolve a key signing key's KMS ARN against: reach Route53 through SimAws so the two are wired together",
      );
    }

    return this.kmsKeys.key(keyManagementServiceArn);
  }

  /**
   * Check the key is one Route53 would build a key-signing key on.
   *
   * Real Route53 checks the key usage as well as the spec. Here the spec
   * decides the usage, so an ECC_NIST_P256 key is a SIGN_VERIFY key and there
   * is nothing left for a separate usage check to catch.
   */
  private requireUsable(key: SimKmsKey): void {
    if (key.keySpec.name !== requiredKeySpec) {
      throw new SimRoute53InvalidKmsArn(
        `KMS key ${key.arn} is ${key.keySpec.name}: a key signing key needs a ${requiredKeySpec} ${SimKmsKeyUsage.SignVerify} key`,
      );
    }

    if (!key.isEnabled) {
      throw new SimRoute53InvalidKmsArn(
        `KMS key ${key.arn} is not enabled: a key signing key needs an enabled key`,
      );
    }
  }
}
