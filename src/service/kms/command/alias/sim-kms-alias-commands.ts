import type { SimKmsRequestOptions } from "../sim-kms-request-options.js";
import {
  SimKmsNotFoundException,
  SimKmsValidationException,
} from "../../error/sim-kms.error.js";
import {
  SimKmsAliasName,
  simKmsAwsAliasPrefix,
} from "../../key/sim-kms-alias.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimCreateAliasCommand,
  SimCreateAliasCommandOutput,
  SimDeleteAliasCommand,
  SimDeleteAliasCommandOutput,
  SimListAliasesCommand,
  SimListAliasesCommandOutput,
} from "./alias.command.js";

interface SimKmsAliasCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

/**
 * The alias commands of one simulated KMS scope.
 */
export class SimKmsAliasCommands {
  private readonly keys: SimKmsKeyStore;
  private readonly authorizer: SimKmsAuthorizer;
  private readonly aliasName = new SimKmsAliasName();

  constructor(properties: SimKmsAliasCommandsProperties) {
    this.keys = properties.keys;
    this.authorizer = properties.authorizer;
  }

  /**
   * Point a new alias at a key.
   *
   * Real KMS checks kms:CreateAlias against both the alias and the target key.
   * Only the key is checked here, because the key is what the alias gives
   * access to and it is the half that carries a policy.
   */
  create(
    command: SimCreateAliasCommand,
    options?: SimKmsRequestOptions,
  ): SimCreateAliasCommandOutput {
    const aliasName = command.input.AliasName;

    if (aliasName === undefined) {
      throw new SimKmsValidationException("AliasName is required");
    }

    this.aliasName.validateCustomerAlias(aliasName);

    const key = this.keys.require(command.input.TargetKeyId);
    this.authorizer.authorizeKey("kms:CreateAlias", key, options);
    this.keys.addAlias(aliasName, key);

    return { $metadata: {} };
  }

  /**
   * Remove an alias, leaving the key it pointed at alone.
   *
   * Real KMS authorizes this against the alias and the target key, and the
   * key is the half checked here for the same reason CreateAlias checks it.
   * An alias reserved for an AWS managed key is refused rather than removed,
   * as real KMS does not let a customer delete one.
   */
  delete(
    command: SimDeleteAliasCommand,
    options?: SimKmsRequestOptions,
  ): SimDeleteAliasCommandOutput {
    const aliasName = command.input.AliasName;

    if (aliasName === undefined) {
      throw new SimKmsValidationException("AliasName is required");
    }

    if (aliasName.startsWith(simKmsAwsAliasPrefix)) {
      throw new SimKmsValidationException(
        `Alias '${aliasName}' is reserved for AWS managed keys`,
      );
    }

    const alias = this.keys.findAlias(aliasName);

    if (alias === undefined) {
      throw new SimKmsNotFoundException(`Alias '${aliasName}' does not exist`);
    }

    const key = this.keys.require(alias.targetKeyId);
    this.authorizer.authorizeKey("kms:DeleteAlias", key, options);
    this.keys.removeAlias(aliasName);

    return { $metadata: {} };
  }

  /**
   * List aliases, optionally narrowed to one key's.
   */
  list(
    command: SimListAliasesCommand,
    options?: SimKmsRequestOptions,
  ): SimListAliasesCommandOutput {
    this.authorizer.authorizeAccount("kms:ListAliases", options);

    const keyId = command.input?.KeyId;
    const aliases = this.keys
      .aliasesFor(
        keyId === undefined ? undefined : this.keys.require(keyId).keyId,
      )
      .map((alias) => ({
        AliasName: alias.aliasName,
        AliasArn: alias.arn,
        TargetKeyId: alias.targetKeyId,
      }));

    const limit = command.input?.Limit;

    if (limit === undefined || aliases.length <= limit) {
      return { $metadata: {}, Aliases: aliases, Truncated: false };
    }

    return {
      $metadata: {},
      Aliases: aliases.slice(0, limit),
      Truncated: true,
    };
  }
}
