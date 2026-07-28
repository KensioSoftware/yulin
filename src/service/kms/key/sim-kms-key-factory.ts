import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { SimKmsCiphertextBlob } from "./sim-kms-ciphertext-blob.js";
import { SimKmsKey, type SimKmsKeyManager } from "./sim-kms-key.js";
import { SimKmsKeyMaterial } from "./sim-kms-key-material.js";
import { SimKmsKeyPolicy } from "./sim-kms-key-policy.js";

interface SimKmsKeyFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

interface SimKmsMakeKeyProperties {
  readonly description?: string | undefined;
  readonly policy?: SimIamPolicyDocument | undefined;
  readonly keyManager?: SimKmsKeyManager | undefined;
}

/**
 * Builds simulated KMS keys, including their key material.
 *
 * Key creation has to assemble an identifier, an ARN, real AES key material
 * and a policy that all agree with each other, so it happens in one place
 * rather than at each call site that needs a key.
 */
export class SimKmsKeyFactory {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clock: SimClock;
  private readonly blob = new SimKmsCiphertextBlob();

  constructor(properties: SimKmsKeyFactoryProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.clock = properties.clock;
  }

  /**
   * Make a new key with fresh key material.
   *
   * Real key IDs are UUIDs, and code in the wild parses them that way, so
   * these are real UUIDs rather than a shorter simulator-only identifier.
   */
  make(properties: SimKmsMakeKeyProperties = {}): SimKmsKey {
    const keyId = randomUUID();
    const arn = `arn:aws:kms:${this.accountRegionScope.regionName}:${this.accountRegionScope.accountId}:key/${keyId}`;

    return new SimKmsKey({
      keyId,
      accountRegionScope: this.accountRegionScope,
      material: new SimKmsKeyMaterial({ keyArn: arn, blob: this.blob }),
      policy: this.keyPolicy(arn, properties.policy),
      creationDate: this.clock.now(),
      description: properties.description,
      keyManager: properties.keyManager,
    });
  }

  private keyPolicy(
    keyArn: string,
    document: SimIamPolicyDocument | undefined,
  ): SimKmsKeyPolicy {
    if (document === undefined) {
      return SimKmsKeyPolicy.default(keyArn, this.accountRegionScope.accountId);
    }

    return new SimKmsKeyPolicy(keyArn, document);
  }
}
