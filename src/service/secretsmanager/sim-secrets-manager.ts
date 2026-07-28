import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimSecretsManagerCfnResourceFactory } from "./cfn/sim-cfn-secrets-manager-resource-factory.js";
import { SimSecretsManagerAuthorizer } from "./command/authorize/sim-secrets-manager-authorizer.js";
import { SimSecretsManagerLifecycleCommands } from "./command/secret/sim-secrets-manager-lifecycle-commands.js";
import { SimSecretsManagerListSecrets } from "./command/secret/sim-secrets-manager-list-secrets.js";
import { SimSecretsManagerSecretCommands } from "./command/secret/sim-secrets-manager-secret-commands.js";
import { SimSecretsManagerUpdateSecret } from "./command/secret/sim-secrets-manager-update-secret.js";
import type * as simSecretsManagerCommands from "./command/sim-secrets-manager-command.types.js";
import { SimSecretsManagerValueCommands } from "./command/value/sim-secrets-manager-value-commands.js";
import type { SimSecretsManagerSecret } from "./secret/sim-secrets-manager-secret.js";
import { SimSecretsManagerSecretExpiry } from "./secret/sim-secrets-manager-secret-expiry.js";
import { SimSecretsManagerSecretFactory } from "./secret/sim-secrets-manager-secret-factory.js";
import { SimSecretsManagerSecretStore } from "./secret/sim-secrets-manager-secret-store.js";
import { SimSecretsManagerVersionWriter } from "./secret/sim-secrets-manager-version-writer.js";
import { SimSecretsManagerSdkCommandRouter } from "./sdk/sim-secrets-manager-sdk-command-router.js";

export interface SimSecretsManagerRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimSecretsManagerProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated Secrets Manager. Handles SDK commands. Emulates AWS behaviour and
 * state.
 *
 * Secrets are scoped to an account and region, as they are on real AWS: a
 * secret name is unique within one of those scopes and nowhere wider.
 */
export class SimSecretsManager {
  private readonly secrets: SimSecretsManagerSecretStore;
  private readonly secretCommands: SimSecretsManagerSecretCommands;
  private readonly updateSecretCommand: SimSecretsManagerUpdateSecret;
  private readonly lifecycleCommands: SimSecretsManagerLifecycleCommands;
  private readonly listSecretsCommand: SimSecretsManagerListSecrets;
  private readonly valueCommands: SimSecretsManagerValueCommands;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimSecretsManagerSdkCommandRouter(this);
  private readonly cfnFactory = new SimSecretsManagerCfnResourceFactory({
    secretsManager: this,
  });

  constructor(properties: SimSecretsManagerProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimSecretsManagerAuthorizer({ iam });
    const versionWriter = new SimSecretsManagerVersionWriter({
      clock: background,
    });

    this.background = background;
    this.secrets = new SimSecretsManagerSecretStore({ accountRegionScope });
    this.secretCommands = new SimSecretsManagerSecretCommands({
      secrets: this.secrets,
      secretFactory: new SimSecretsManagerSecretFactory({
        accountRegionScope,
        clock: background,
      }),
      versionWriter,
      authorizer,
    });
    this.updateSecretCommand = new SimSecretsManagerUpdateSecret({
      secrets: this.secrets,
      versionWriter,
      authorizer,
      clock: background,
    });
    this.lifecycleCommands = new SimSecretsManagerLifecycleCommands({
      secrets: this.secrets,
      expiry: new SimSecretsManagerSecretExpiry({
        secrets: this.secrets,
        background,
      }),
      authorizer,
      clock: background,
    });
    this.listSecretsCommand = new SimSecretsManagerListSecrets({
      secrets: this.secrets,
      authorizer,
    });
    this.valueCommands = new SimSecretsManagerValueCommands({
      secrets: this.secrets,
      versionWriter,
      authorizer,
    });
  }

  /**
   * Find a secret by friendly name, full ARN or partial ARN.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * secret state without going through a Command and its authorization.
   */
  findSecret(secretId: string): SimSecretsManagerSecret | undefined {
    return this.secrets.find(secretId);
  }

  /**
   * Handle a CreateSecret Command from the SDK.
   */
  async createSecret(
    command: simSecretsManagerCommands.SimCreateSecretCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimCreateSecretCommandOutput> {
    await this.background.sequence();
    return this.secretCommands.create(command, options);
  }

  /**
   * Handle a DescribeSecret Command from the SDK.
   */
  async describeSecret(
    command: simSecretsManagerCommands.SimDescribeSecretCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimDescribeSecretCommandOutput> {
    await this.background.sequence();
    return this.secretCommands.describe(command, options);
  }

  /**
   * Handle an UpdateSecret Command from the SDK.
   */
  async updateSecret(
    command: simSecretsManagerCommands.SimUpdateSecretCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimUpdateSecretCommandOutput> {
    await this.background.sequence();
    return this.updateSecretCommand.handle(command, options);
  }

  /**
   * Handle a ListSecrets Command from the SDK.
   */
  async listSecrets(
    command: simSecretsManagerCommands.SimListSecretsCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimListSecretsCommandOutput> {
    await this.background.sequence();
    return this.listSecretsCommand.handle(command, options);
  }

  /**
   * Handle a GetSecretValue Command from the SDK.
   */
  async getSecretValue(
    command: simSecretsManagerCommands.SimGetSecretValueCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimGetSecretValueCommandOutput> {
    await this.background.sequence();
    return this.valueCommands.get(command, options);
  }

  /**
   * Handle a PutSecretValue Command from the SDK.
   */
  async putSecretValue(
    command: simSecretsManagerCommands.SimPutSecretValueCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimPutSecretValueCommandOutput> {
    await this.background.sequence();
    return this.valueCommands.put(command, options);
  }

  /**
   * Handle a DeleteSecret Command from the SDK.
   */
  async deleteSecret(
    command: simSecretsManagerCommands.SimDeleteSecretCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimDeleteSecretCommandOutput> {
    await this.background.sequence();
    return this.lifecycleCommands.delete(command, options);
  }

  /**
   * Handle a RestoreSecret Command from the SDK.
   */
  async restoreSecret(
    command: simSecretsManagerCommands.SimRestoreSecretCommand,
    options?: SimSecretsManagerRequestOptions,
  ): Promise<simSecretsManagerCommands.SimRestoreSecretCommandOutput> {
    await this.background.sequence();
    return this.lifecycleCommands.restore(command, options);
  }

  /**
   * Get this service's CloudFormation Resource factory, which creates
   * simulated secrets from AWS::SecretsManager::* Resources.
   */
  cfnResourceFactory(): SimSecretsManagerCfnResourceFactory {
    return this.cfnFactory;
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
