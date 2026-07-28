import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimKmsValidationException } from "../../error/sim-kms.error.js";
import { simKmsKeyPolicyName } from "../../key/sim-kms-key-policy.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import { SimKmsPolicyDocument } from "../../key/sim-kms-policy-document.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimGetKeyPolicyCommand,
  SimGetKeyPolicyCommandOutput,
  SimPutKeyPolicyCommand,
  SimPutKeyPolicyCommandOutput,
} from "./key.command.js";

interface SimKmsKeyPolicyCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

interface SimKmsKeyPolicyCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The commands that read and replace a simulated KMS key policy.
 *
 * Replacing a key policy can lock the key out of its own Account, exactly as
 * on real AWS: a policy with no statement for the Account root leaves the key
 * reachable only by the principals it names, and no IAM policy will get it
 * back. That is deliberate, and it is the behaviour worth being able to test.
 */
export class SimKmsKeyPolicyCommands {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly policyDocument = new SimKmsPolicyDocument();

  constructor(properties: SimKmsKeyPolicyCommandsProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
  }

  /**
   * Get a key's policy, as the JSON document string the real API returns.
   */
  get(
    command: SimGetKeyPolicyCommand,
    options?: SimKmsKeyPolicyCommandOptions,
  ): SimGetKeyPolicyCommandOutput {
    this.requireDefaultPolicyName(command.input.PolicyName);

    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey("kms:GetKeyPolicy", key, options?.caller);

    return {
      $metadata: {},
      PolicyName: simKmsKeyPolicyName,
      Policy: JSON.stringify(key.policy.document()),
    };
  }

  /**
   * Replace a key's policy.
   */
  put(
    command: SimPutKeyPolicyCommand,
    options?: SimKmsKeyPolicyCommandOptions,
  ): SimPutKeyPolicyCommandOutput {
    this.requireDefaultPolicyName(command.input.PolicyName);

    const policy = command.input.Policy;

    if (policy === undefined) {
      throw new SimKmsValidationException("Policy is required");
    }

    const document = this.policyDocument.parse(policy);
    const key = this.keys.require(command.input.KeyId);

    this.authorizer.authorizeKey("kms:PutKeyPolicy", key, options?.caller);
    key.policy.replaceWith(document);

    return { $metadata: {} };
  }

  /**
   * A KMS key has exactly one policy, and it is always called "default".
   */
  private requireDefaultPolicyName(policyName: string | undefined): void {
    if (policyName !== undefined && policyName !== simKmsKeyPolicyName) {
      throw new SimKmsValidationException(
        `PolicyName must be '${simKmsKeyPolicyName}': a KMS key has exactly one policy`,
      );
    }
  }
}
