import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimKmsValidationException } from "../../error/sim-kms.error.js";
import { SimKmsAliasName } from "../../key/sim-kms-alias.js";
import type { SimKmsKeyStore } from "../../key/sim-kms-key-store.js";
import type { SimKmsAuthorizer } from "../authorize/sim-kms-authorizer.js";
import type {
  SimCreateAliasCommand,
  SimCreateAliasCommandOutput,
  SimListAliasesCommand,
  SimListAliasesCommandOutput,
} from "./alias.command.js";

interface SimKmsAliasCommandsProperties {
  readonly keys: SimKmsKeyStore;
  readonly authorizer: SimKmsAuthorizer;
}

interface SimKmsAliasCommandOptions {
  readonly caller?: SimAwsCaller;
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
    options?: SimKmsAliasCommandOptions,
  ): SimCreateAliasCommandOutput {
    const aliasName = command.input.AliasName;

    if (aliasName === undefined) {
      throw new SimKmsValidationException("AliasName is required");
    }

    this.aliasName.validateCustomerAlias(aliasName);

    const key = this.keys.require(command.input.TargetKeyId);
    this.authorizer.authorizeKey("kms:CreateAlias", key, options?.caller);
    this.keys.addAlias(aliasName, key);

    return { $metadata: {} };
  }

  /**
   * List aliases, optionally narrowed to one key's.
   */
  list(
    command: SimListAliasesCommand,
    options?: SimKmsAliasCommandOptions,
  ): SimListAliasesCommandOutput {
    this.authorizer.authorizeAccount("kms:ListAliases", options?.caller);

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
