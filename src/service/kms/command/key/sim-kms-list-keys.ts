import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimListKeysCommand,
  SimListKeysCommandOutput,
} from "./key.command.js";

interface SimKmsListKeysProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

interface SimKmsListKeysOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The ListKeys command of one simulated KMS scope.
 *
 * Real KMS gives kms:ListKeys no resource-level permissions, so the listing is
 * authorized once rather than per key. It therefore reports keys the caller
 * may not be allowed to use, which is what real KMS does too.
 */
export class SimKmsListKeys {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;

  constructor(properties: SimKmsListKeysProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
  }

  /**
   * List the keys in this scope, up to any requested limit.
   */
  handle(
    command: SimListKeysCommand,
    options?: SimKmsListKeysOptions,
  ): SimListKeysCommandOutput {
    this.authorizer.authorizeAccount("kms:ListKeys", options?.caller);

    const limit = command.input?.Limit;
    const entries = this.keys.keys
      .values()
      .map((key) => ({ KeyId: key.keyId, KeyArn: key.arn }))
      .toArray();

    if (limit === undefined || entries.length <= limit) {
      return { $metadata: {}, Keys: entries, Truncated: false };
    }

    return { $metadata: {}, Keys: entries.slice(0, limit), Truncated: true };
  }
}
