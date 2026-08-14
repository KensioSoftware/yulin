import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";
import type { SimKmsKeyFactory } from "../../key/sim-kms-key-factory.js";
import { SimKmsPolicyDocument } from "../../key/sim-kms-policy-document.js";
import { SimKmsKeyType } from "./sim-kms-key-type.js";
import type { SimKmsKeyMetadataView } from "../../key/sim-kms-key-metadata.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimCreateKeyCommand,
  SimCreateKeyCommandOutput,
  SimDescribeKeyCommand,
  SimDescribeKeyCommandOutput,
} from "./key.command.js";

interface SimKmsKeyCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly keyFactory: SimKmsKeyFactory;
  readonly authorizer: SimKmsAuthorizer;
  readonly metadata: SimKmsKeyMetadataView;
}

/**
 * The key creation and description commands of one simulated KMS scope.
 */
export class SimKmsKeyCommands {
  private readonly keys: SimKmsKeyStore;
  private readonly keyFactory: SimKmsKeyFactory;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly metadata: SimKmsKeyMetadataView;
  private readonly keyType = new SimKmsKeyType();
  private readonly policyDocument = new SimKmsPolicyDocument();

  constructor(properties: SimKmsKeyCommandsProperties) {
    this.keys = properties.keys;
    this.keyFactory = properties.keyFactory;
    this.authorizer = properties.authorizer;
    this.metadata = properties.metadata;
  }

  /**
   * Create a key with fresh key material.
   *
   * There is no key to hold a policy yet, so this authorizes against the
   * Region's keys rather than a key policy. Real KMS gives kms:CreateKey no
   * resource-level permissions for the same reason.
   */
  create(
    command: SimCreateKeyCommand,
    options?: SimKmsRequestOptions,
  ): SimCreateKeyCommandOutput {
    const keySpec = this.keyType.require(
      command.input.KeyUsage,
      command.input.KeySpec,
      command.input.Origin,
    );
    this.authorizer.authorizeAccount("kms:CreateKey", options);

    const key = this.keyFactory.make({
      description: command.input.Description,
      policy: this.policyDocument.parseOptional(command.input.Policy),
      keySpec,
    });

    this.keys.add(key);

    return { $metadata: {}, KeyMetadata: this.metadata.describe(key) };
  }

  /**
   * Describe a key.
   */
  describe(
    command: SimDescribeKeyCommand,
    options?: SimKmsRequestOptions,
  ): SimDescribeKeyCommandOutput {
    const key = this.keys.require(command.input.KeyId);
    this.authorizer.authorizeKey("kms:DescribeKey", key, options);

    return { $metadata: {}, KeyMetadata: this.metadata.describe(key) };
  }
}
