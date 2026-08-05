import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type * as simKmsCommands from "./command/sim-kms-command.types.js";
import type { SimKmsRequestOptions } from "./command/sim-kms-request-options.js";
import { SimKmsCfnResourceFactory } from "./cfn/sim-cfn-kms-resource-factory.js";
import type { SimKmsAlias } from "./key/sim-kms-alias.js";
import type { SimKmsKey } from "./key/sim-kms-key.js";
import { SimKmsSdkCommandRouter } from "./sdk/sim-kms-sdk-command-router.js";
import { SimKmsCommands, type SimKmsProperties } from "./sim-kms-commands.js";

/**
 * Simulated KMS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Encryption here is real encryption, not a stand-in: each key holds real
 * AES-256 key material and the operations run through Node's crypto. A
 * ciphertext genuinely cannot be read without its key, and a decryption with
 * the wrong encryption context genuinely fails.
 */
export class SimKms {
  private readonly commands: SimKmsCommands;
  private readonly sdkRouter = new SimKmsSdkCommandRouter(this);
  private readonly cfnFactory = new SimKmsCfnResourceFactory({ kms: this });

  constructor(properties: SimKmsProperties = {}) {
    this.commands = new SimKmsCommands(properties);
  }

  /**
   * Find a key by key ID, key ARN, alias name or alias ARN.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting key
   * state without going through a Command and its authorization.
   */
  findKey(keyId: string): SimKmsKey | undefined {
    return this.commands.keys.find(keyId);
  }

  /**
   * Find an alias by name.
   *
   * This is the simulator's own accessor, alongside `findKey`, for tests and
   * for CloudFormation Resource creation to get at the alias it just made.
   */
  findAlias(aliasName: string): SimKmsAlias | undefined {
    return this.commands.keys.findAlias(aliasName);
  }

  /**
   * Handle a CreateKey Command from the SDK.
   */
  async createKey(
    command: simKmsCommands.SimCreateKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimCreateKeyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.key.create(command, options);
  }

  /**
   * Handle a DescribeKey Command from the SDK.
   */
  async describeKey(
    command: simKmsCommands.SimDescribeKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDescribeKeyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.key.describe(command, options);
  }

  /**
   * Handle a ListKeys Command from the SDK.
   */
  async listKeys(
    command: simKmsCommands.SimListKeysCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimListKeysCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.listKeys.handle(command, options);
  }

  /**
   * Handle a GetKeyPolicy Command from the SDK.
   */
  async getKeyPolicy(
    command: simKmsCommands.SimGetKeyPolicyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimGetKeyPolicyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.policies.get(command, options);
  }

  /**
   * Handle a PutKeyPolicy Command from the SDK.
   */
  async putKeyPolicy(
    command: simKmsCommands.SimPutKeyPolicyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimPutKeyPolicyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.policies.put(command, options);
  }

  /**
   * Handle an EnableKey Command from the SDK.
   */
  async enableKey(
    command: simKmsCommands.SimEnableKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimEnableKeyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.lifecycle.enable(command, options);
  }

  /**
   * Handle a DisableKey Command from the SDK.
   */
  async disableKey(
    command: simKmsCommands.SimDisableKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDisableKeyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.lifecycle.disable(command, options);
  }

  /**
   * Handle a ScheduleKeyDeletion Command from the SDK.
   */
  async scheduleKeyDeletion(
    command: simKmsCommands.SimScheduleKeyDeletionCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimScheduleKeyDeletionCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.lifecycle.scheduleDeletion(command, options);
  }

  /**
   * Handle a CancelKeyDeletion Command from the SDK.
   */
  async cancelKeyDeletion(
    command: simKmsCommands.SimCancelKeyDeletionCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimCancelKeyDeletionCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.lifecycle.cancelDeletion(command, options);
  }

  /**
   * Handle a CreateAlias Command from the SDK.
   */
  async createAlias(
    command: simKmsCommands.SimCreateAliasCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimCreateAliasCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.aliases.create(command, options);
  }

  /**
   * Handle a DeleteAlias Command from the SDK.
   */
  async deleteAlias(
    command: simKmsCommands.SimDeleteAliasCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDeleteAliasCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.aliases.delete(command, options);
  }

  /**
   * Handle a ListAliases Command from the SDK.
   */
  async listAliases(
    command: simKmsCommands.SimListAliasesCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimListAliasesCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.aliases.list(command, options);
  }

  /**
   * Handle an Encrypt Command from the SDK.
   */
  async encrypt(
    command: simKmsCommands.SimEncryptCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimEncryptCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.crypto.encrypt(command, options);
  }

  /**
   * Handle a Decrypt Command from the SDK.
   */
  async decrypt(
    command: simKmsCommands.SimDecryptCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDecryptCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.crypto.decrypt(command, options);
  }

  /**
   * Handle a GenerateDataKey Command from the SDK.
   */
  async generateDataKey(
    command: simKmsCommands.SimGenerateDataKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimGenerateDataKeyCommandOutput> {
    await this.commands.background.sequence();
    return this.commands.generateDataKey.handle(command, options);
  }

  /**
   * Get this service's CloudFormation Resource factory, which creates
   * simulated keys and aliases from AWS::KMS::* Resources.
   */
  cfnResourceFactory(): SimKmsCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
