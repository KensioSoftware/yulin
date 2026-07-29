import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";
import { randomBytes } from "node:crypto";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimGenerateDataKeyCommand,
  SimGenerateDataKeyCommandOutput,
} from "./crypto.command.js";
import { SimKmsDataKeySpec } from "./sim-kms-data-key-spec.js";

interface SimKmsGenerateDataKeyProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

/**
 * The GenerateDataKey command of one simulated KMS scope.
 *
 * This is the envelope encryption primitive, and the answer to Encrypt's
 * 4096 byte limit: the plaintext copy of the data key encrypts the data and is
 * then discarded, while the encrypted copy is stored alongside it so the data
 * key can be recovered through Decrypt later.
 */
export class SimKmsGenerateDataKey {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly dataKeySpec = new SimKmsDataKeySpec();

  constructor(properties: SimKmsGenerateDataKeyProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
  }

  /**
   * Generate a data key, returned both in the clear and encrypted.
   */
  handle(
    command: SimGenerateDataKeyCommand,
    options?: SimKmsRequestOptions,
  ): SimGenerateDataKeyCommandOutput {
    const length = this.dataKeySpec.lengthFor(
      command.input.KeySpec,
      command.input.NumberOfBytes,
    );
    const key = this.keys.require(command.input.KeyId);

    this.authorizer.authorizeKey("kms:GenerateDataKey", key, options);

    const dataKey = Uint8Array.from(randomBytes(length));

    return {
      $metadata: {},
      Plaintext: dataKey,
      CiphertextBlob: key.encrypt(dataKey, command.input.EncryptionContext),
      KeyId: key.arn,
    };
  }
}
