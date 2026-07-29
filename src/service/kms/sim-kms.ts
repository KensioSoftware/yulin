import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import { SimKmsAliasCommands } from "./command/alias/sim-kms-alias-commands.js";
import type * as simKmsCommands from "./command/sim-kms-command.types.js";
import type { SimKmsRequestOptions } from "./command/sim-kms-request-options.js";
import { SimKmsAuthorizer } from "./command/authorize/sim-kms-authorizer.js";
import { SimKmsCryptoCommands } from "./command/crypto/sim-kms-crypto-commands.js";
import { SimKmsGenerateDataKey } from "./command/crypto/sim-kms-generate-data-key.js";
import { SimKmsKeyCommands } from "./command/key/sim-kms-key-commands.js";
import { SimKmsListKeys } from "./command/key/sim-kms-list-keys.js";
import { SimKmsKeyLifecycleCommands } from "./command/key/sim-kms-key-lifecycle-commands.js";
import { SimKmsKeyPolicyCommands } from "./command/key/sim-kms-key-policy-commands.js";
import { SimKmsCfnResourceFactory } from "./cfn/sim-cfn-kms-resource-factory.js";
import type { SimKmsAlias } from "./key/sim-kms-alias.js";
import type { SimKmsKey } from "./key/sim-kms-key.js";
import { SimKmsKeyFactory } from "./key/sim-kms-key-factory.js";
import { SimKmsKeyMetadataView } from "./key/sim-kms-key-metadata.js";
import { SimKmsKeyStore } from "./key/sim-kms-key-store.js";
import { SimKmsSdkCommandRouter } from "./sdk/sim-kms-sdk-command-router.js";

interface SimKmsProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated KMS. Handles SDK commands. Emulates AWS behaviour and state.
 *
 * Encryption here is real encryption, not a stand-in: each key holds real
 * AES-256 key material and the operations run through Node's crypto. A
 * ciphertext genuinely cannot be read without its key, and a decryption with
 * the wrong encryption context genuinely fails.
 */
export class SimKms {
  private readonly keys: SimKmsKeyStore;
  private readonly keyCommands: SimKmsKeyCommands;
  private readonly listKeysCommand: SimKmsListKeys;
  private readonly lifecycleCommands: SimKmsKeyLifecycleCommands;
  private readonly policyCommands: SimKmsKeyPolicyCommands;
  private readonly aliasCommands: SimKmsAliasCommands;
  private readonly cryptoCommands: SimKmsCryptoCommands;
  private readonly generateDataKeyCommand: SimKmsGenerateDataKey;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimKmsSdkCommandRouter(this);
  private readonly cfnFactory = new SimKmsCfnResourceFactory({ kms: this });

  constructor(properties: SimKmsProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const keyFactory = new SimKmsKeyFactory({
      accountRegionScope,
      clock: background,
    });
    const authorizer = new SimKmsAuthorizer({ iam, accountRegionScope });

    this.background = background;
    this.keys = new SimKmsKeyStore({ accountRegionScope, keyFactory });
    this.keyCommands = new SimKmsKeyCommands({
      keys: this.keys,
      keyFactory,
      authorizer,
      metadata: new SimKmsKeyMetadataView(accountRegionScope.accountId),
    });
    this.listKeysCommand = new SimKmsListKeys({ keys: this.keys, authorizer });
    this.lifecycleCommands = new SimKmsKeyLifecycleCommands({
      keys: this.keys,
      authorizer,
      clock: background,
    });
    this.policyCommands = new SimKmsKeyPolicyCommands({
      keys: this.keys,
      authorizer,
    });
    this.aliasCommands = new SimKmsAliasCommands({
      keys: this.keys,
      authorizer,
    });
    this.cryptoCommands = new SimKmsCryptoCommands({
      keys: this.keys,
      authorizer,
    });
    this.generateDataKeyCommand = new SimKmsGenerateDataKey({
      keys: this.keys,
      authorizer,
    });
  }

  /**
   * Find a key by key ID, key ARN, alias name or alias ARN.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting key
   * state without going through a Command and its authorization.
   */
  findKey(keyId: string): SimKmsKey | undefined {
    return this.keys.find(keyId);
  }

  /**
   * Find an alias by name.
   *
   * This is the simulator's own accessor, alongside `findKey`, for tests and
   * for CloudFormation Resource creation to get at the alias it just made.
   */
  findAlias(aliasName: string): SimKmsAlias | undefined {
    return this.keys.findAlias(aliasName);
  }

  /**
   * Handle a CreateKey Command from the SDK.
   */
  async createKey(
    command: simKmsCommands.SimCreateKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimCreateKeyCommandOutput> {
    await this.background.sequence();
    return this.keyCommands.create(command, options);
  }

  /**
   * Handle a DescribeKey Command from the SDK.
   */
  async describeKey(
    command: simKmsCommands.SimDescribeKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDescribeKeyCommandOutput> {
    await this.background.sequence();
    return this.keyCommands.describe(command, options);
  }

  /**
   * Handle a ListKeys Command from the SDK.
   */
  async listKeys(
    command: simKmsCommands.SimListKeysCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimListKeysCommandOutput> {
    await this.background.sequence();
    return this.listKeysCommand.handle(command, options);
  }

  /**
   * Handle a GetKeyPolicy Command from the SDK.
   */
  async getKeyPolicy(
    command: simKmsCommands.SimGetKeyPolicyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimGetKeyPolicyCommandOutput> {
    await this.background.sequence();
    return this.policyCommands.get(command, options);
  }

  /**
   * Handle a PutKeyPolicy Command from the SDK.
   */
  async putKeyPolicy(
    command: simKmsCommands.SimPutKeyPolicyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimPutKeyPolicyCommandOutput> {
    await this.background.sequence();
    return this.policyCommands.put(command, options);
  }

  /**
   * Handle an EnableKey Command from the SDK.
   */
  async enableKey(
    command: simKmsCommands.SimEnableKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimEnableKeyCommandOutput> {
    await this.background.sequence();
    return this.lifecycleCommands.enable(command, options);
  }

  /**
   * Handle a DisableKey Command from the SDK.
   */
  async disableKey(
    command: simKmsCommands.SimDisableKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDisableKeyCommandOutput> {
    await this.background.sequence();
    return this.lifecycleCommands.disable(command, options);
  }

  /**
   * Handle a ScheduleKeyDeletion Command from the SDK.
   */
  async scheduleKeyDeletion(
    command: simKmsCommands.SimScheduleKeyDeletionCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimScheduleKeyDeletionCommandOutput> {
    await this.background.sequence();
    return this.lifecycleCommands.scheduleDeletion(command, options);
  }

  /**
   * Handle a CancelKeyDeletion Command from the SDK.
   */
  async cancelKeyDeletion(
    command: simKmsCommands.SimCancelKeyDeletionCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimCancelKeyDeletionCommandOutput> {
    await this.background.sequence();
    return this.lifecycleCommands.cancelDeletion(command, options);
  }

  /**
   * Handle a CreateAlias Command from the SDK.
   */
  async createAlias(
    command: simKmsCommands.SimCreateAliasCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimCreateAliasCommandOutput> {
    await this.background.sequence();
    return this.aliasCommands.create(command, options);
  }

  /**
   * Handle a ListAliases Command from the SDK.
   */
  async listAliases(
    command: simKmsCommands.SimListAliasesCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimListAliasesCommandOutput> {
    await this.background.sequence();
    return this.aliasCommands.list(command, options);
  }

  /**
   * Handle an Encrypt Command from the SDK.
   */
  async encrypt(
    command: simKmsCommands.SimEncryptCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimEncryptCommandOutput> {
    await this.background.sequence();
    return this.cryptoCommands.encrypt(command, options);
  }

  /**
   * Handle a Decrypt Command from the SDK.
   */
  async decrypt(
    command: simKmsCommands.SimDecryptCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimDecryptCommandOutput> {
    await this.background.sequence();
    return this.cryptoCommands.decrypt(command, options);
  }

  /**
   * Handle a GenerateDataKey Command from the SDK.
   */
  async generateDataKey(
    command: simKmsCommands.SimGenerateDataKeyCommand,
    options?: SimKmsRequestOptions,
  ): Promise<simKmsCommands.SimGenerateDataKeyCommandOutput> {
    await this.background.sequence();
    return this.generateDataKeyCommand.handle(command, options);
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
