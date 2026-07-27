import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimKmsValidationException } from "../../error/sim-kms.error.js";
import { SimKmsCiphertextBlob } from "../../key/sim-kms-ciphertext-blob.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import {
  SimKmsCiphertextKey,
  simKmsSymmetricAlgorithm,
} from "./sim-kms-ciphertext-key.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimDecryptCommand,
  SimDecryptCommandOutput,
  SimEncryptCommand,
  SimEncryptCommandOutput,
} from "./crypto.command.js";

/**
 * The largest plaintext Encrypt accepts for a symmetric key.
 *
 * This limit is the whole reason envelope encryption exists, so enforcing it
 * is what makes a test that outgrows Encrypt fail here rather than in
 * production.
 */
const maxPlaintextBytes = 4096;

interface SimKmsCryptoCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

interface SimKmsCryptoCommandOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The Encrypt and Decrypt commands of one simulated KMS scope.
 *
 * They share the key store, the authorizer and the ciphertext blob format, so
 * they are grouped rather than wired separately on the facade.
 */
export class SimKmsCryptoCommands {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly blob = new SimKmsCiphertextBlob();
  private readonly ciphertextKey: SimKmsCiphertextKey;

  constructor(properties: SimKmsCryptoCommandsProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
    this.ciphertextKey = new SimKmsCiphertextKey(properties.keys);
  }

  /**
   * Encrypt plaintext under a key.
   */
  encrypt(
    command: SimEncryptCommand,
    options?: SimKmsCryptoCommandOptions,
  ): SimEncryptCommandOutput {
    const plaintext = command.input.Plaintext;

    this.ciphertextKey.requireSymmetricAlgorithm(
      command.input.EncryptionAlgorithm,
    );

    if (plaintext === undefined || plaintext.length === 0) {
      throw new SimKmsValidationException("Plaintext is required");
    }

    if (plaintext.length > maxPlaintextBytes) {
      throw new SimKmsValidationException(
        `Plaintext of ${String(plaintext.length)} bytes exceeds the ${String(maxPlaintextBytes)} byte limit for a symmetric key; encrypt a data key from GenerateDataKey instead`,
      );
    }

    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey("kms:Encrypt", key, options?.caller);

    return {
      $metadata: {},
      CiphertextBlob: key.encrypt(plaintext, command.input.EncryptionContext),
      KeyId: key.arn,
      EncryptionAlgorithm: simKmsSymmetricAlgorithm,
    };
  }

  /**
   * Decrypt a ciphertext produced by this simulation.
   *
   * The key comes from the ciphertext rather than the request, which is why
   * KeyId is optional for a symmetric key. Authorization therefore happens
   * against the key the blob names, once it is known.
   */
  decrypt(
    command: SimDecryptCommand,
    options?: SimKmsCryptoCommandOptions,
  ): SimDecryptCommandOutput {
    const ciphertextBlob = command.input.CiphertextBlob;

    this.ciphertextKey.requireSymmetricAlgorithm(
      command.input.EncryptionAlgorithm,
    );

    if (ciphertextBlob === undefined) {
      throw new SimKmsValidationException("CiphertextBlob is required");
    }

    const parts = this.blob.decode(ciphertextBlob);
    const key = this.ciphertextKey.behind(parts.keyArn);

    this.authorizer.authorizeKey("kms:Decrypt", key, options?.caller);
    this.ciphertextKey.requireExpected(command.input.KeyId, key);

    return {
      $metadata: {},
      Plaintext: key.decrypt(parts, command.input.EncryptionContext),
      KeyId: key.arn,
      EncryptionAlgorithm: simKmsSymmetricAlgorithm,
    };
  }
}
