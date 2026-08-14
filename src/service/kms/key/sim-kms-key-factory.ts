import { randomUUID } from "node:crypto";
import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { SimKmsCiphertextBlob } from "./sim-kms-ciphertext-blob.js";
import { SimKmsKey, SimKmsKeyManager } from "./sim-kms-key.js";
import { makeSimKmsKeyMaterial } from "./sim-kms-key-material-factory.js";
import { SimKmsKeyPolicy } from "./sim-kms-key-policy.js";
import { SimKmsViaService } from "./sim-kms-via-service.js";
import type { SimKmsKeySpec } from "./spec/sim-kms-key-spec.js";
import { simKmsSymmetricKeySpec } from "./spec/sim-kms-key-specs.js";

interface SimKmsKeyFactoryProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

interface SimKmsMakeKeyProperties {
  readonly description?: string | undefined;
  readonly policy?: SimIamPolicyDocument | undefined;

  /**
   * The spec the key is made to. Omitting it gets a symmetric encryption key,
   * which is what CreateKey gives a request naming no KeySpec.
   */
  readonly keySpec?: SimKmsKeySpec | undefined;

  /**
   * The service an AWS managed key belongs to, such as `ssm`.
   *
   * Naming it is what makes the key an AWS managed one: it decides both the
   * key manager and the via-service-scoped policy real AWS gives such a key,
   * so the two cannot disagree.
   */
  readonly awsManagedService?: string | undefined;
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
      material: makeSimKmsKeyMaterial({
        keyArn: arn,
        keySpec: properties.keySpec ?? simKmsSymmetricKeySpec,
        blob: this.blob,
      }),
      policy: this.keyPolicy(arn, properties),
      creationDate: this.clock.now(),
      description: properties.description,
      keyManager: this.keyManager(properties),
    });
  }

  /**
   * Who manages the key, which is decided by whether a service owns it.
   */
  private keyManager(
    properties: SimKmsMakeKeyProperties,
  ): SimKmsKeyManager | undefined {
    if (properties.awsManagedService === undefined) {
      return undefined;
    }

    return SimKmsKeyManager.Aws;
  }

  /**
   * The policy the key starts with: the one asked for, the AWS managed one, or
   * the customer default.
   */
  private keyPolicy(
    keyArn: string,
    properties: SimKmsMakeKeyProperties,
  ): SimKmsKeyPolicy {
    if (properties.policy !== undefined) {
      return new SimKmsKeyPolicy(keyArn, properties.policy);
    }

    const accountId = this.accountRegionScope.accountId;

    if (properties.awsManagedService !== undefined) {
      return SimKmsKeyPolicy.awsManaged(
        keyArn,
        accountId,
        new SimKmsViaService(
          properties.awsManagedService,
          this.accountRegionScope.regionName,
        ),
      );
    }

    return SimKmsKeyPolicy.default(keyArn, accountId);
  }
}
