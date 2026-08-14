import { SimKmsInvalidSignatureException } from "../../error/sim-kms.error.js";
import type { SimKmsKey } from "../../key/sim-kms-key.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";
import { SimKmsSignedMessage } from "./sim-kms-signed-message.js";
import type {
  SimGetPublicKeyCommand,
  SimGetPublicKeyCommandOutput,
  SimSignCommand,
  SimSignCommandOutput,
  SimVerifyCommand,
  SimVerifyCommandOutput,
} from "./sign.command.js";

interface SimKmsSignCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

/**
 * The Sign, Verify and GetPublicKey commands of one simulated KMS scope.
 *
 * The three go together: they are the operations an asymmetric signing key
 * answers, they share the key store and the authorizer, and each of them has
 * to refuse a key whose usage is not SIGN_VERIFY.
 */
export class SimKmsSignCommands {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly message = new SimKmsSignedMessage();

  constructor(properties: SimKmsSignCommandsProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
  }

  /**
   * Sign a message under a key.
   */
  sign(
    command: SimSignCommand,
    options?: SimKmsRequestOptions,
  ): SimSignCommandOutput {
    const message = this.message.require(
      command.input.Message,
      command.input.MessageType,
    );
    const key = this.authorizedKey("kms:Sign", command.input.KeyId, options);
    const algorithm = key.keySpec.requireSigningAlgorithm(
      command.input.SigningAlgorithm,
    );

    return {
      $metadata: {},
      KeyId: key.arn,
      Signature: key.sign(message, algorithm),
      SigningAlgorithm: algorithm.name,
    };
  }

  /**
   * Check a signature against a message and a key.
   *
   * A signature that does not check out fails rather than returning false.
   * That is what real KMS does, so a caller that only handles the exception is
   * not left believing an unverified signature was good.
   */
  verify(
    command: SimVerifyCommand,
    options?: SimKmsRequestOptions,
  ): SimVerifyCommandOutput {
    const message = this.message.require(
      command.input.Message,
      command.input.MessageType,
    );
    const key = this.authorizedKey("kms:Verify", command.input.KeyId, options);
    const algorithm = key.keySpec.requireSigningAlgorithm(
      command.input.SigningAlgorithm,
    );
    const signature = this.message.requireSignature(command.input.Signature);

    if (!key.verify(message, signature, algorithm)) {
      throw new SimKmsInvalidSignatureException(
        `The signature was not verified by key ${key.arn} under ${algorithm.name}`,
      );
    }

    return {
      $metadata: {},
      KeyId: key.arn,
      SignatureValid: true,
      SigningAlgorithm: algorithm.name,
    };
  }

  /**
   * Get a key's public key.
   */
  getPublicKey(
    command: SimGetPublicKeyCommand,
    options?: SimKmsRequestOptions,
  ): SimGetPublicKeyCommandOutput {
    const key = this.authorizedKey(
      "kms:GetPublicKey",
      command.input.KeyId,
      options,
    );
    const keySpec = key.keySpec;

    return {
      $metadata: {},
      KeyId: key.arn,
      PublicKey: key.publicKeyDer(),
      KeySpec: keySpec.name,
      CustomerMasterKeySpec: keySpec.name,
      KeyUsage: keySpec.keyUsage,
      SigningAlgorithms: keySpec.signingAlgorithmNames(),
    };
  }

  private authorizedKey(
    action: string,
    keyId: string | undefined,
    options: SimKmsRequestOptions | undefined,
  ): SimKmsKey {
    const key = this.keys.require(keyId);
    this.authorizer.authorizeKey(action, key, options);

    return key;
  }
}
