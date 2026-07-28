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
import { SimSsmAuthorizer } from "./command/authorize/sim-ssm-authorizer.js";
import { SimSsmDeleteParameterCommands } from "./command/parameter/sim-ssm-delete-parameter-commands.js";
import { SimSsmDescribeParameters } from "./command/parameter/sim-ssm-describe-parameters.js";
import { SimSsmGetParameterCommands } from "./command/parameter/sim-ssm-get-parameter-commands.js";
import { SimSsmGetParametersByPath } from "./command/parameter/sim-ssm-get-parameters-by-path.js";
import { SimSsmPutParameter } from "./command/parameter/sim-ssm-put-parameter.js";
import type * as simSsmCommands from "./command/sim-ssm-command.types.js";
import type { SimSsmParameter } from "./parameter/sim-ssm-parameter.js";
import { SimSsmParameterStore } from "./parameter/sim-ssm-parameter-store.js";
import { SimSsmParameterWriter } from "./parameter/sim-ssm-parameter-writer.js";
import { SimSsmSdkCommandRouter } from "./sdk/sim-ssm-sdk-command-router.js";

export interface SimSsmRequestOptions {
  readonly caller?: SimAwsCaller;
}

interface SimSsmProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly background?: BackgroundScheduler;
}

/**
 * Simulated SSM Parameter Store. Handles SDK commands. Emulates AWS behaviour
 * and state.
 *
 * Parameters are scoped to an account and region, as they are on real AWS: a
 * parameter name is unique within one of those scopes and its ARN names the
 * region.
 *
 * Only Parameter Store is simulated. Nothing else in Systems Manager is.
 */
export class SimSsm {
  private readonly parameters: SimSsmParameterStore;
  private readonly putParameterCommand: SimSsmPutParameter;
  private readonly readCommands: SimSsmGetParameterCommands;
  private readonly pathCommand: SimSsmGetParametersByPath;
  private readonly deletionCommands: SimSsmDeleteParameterCommands;
  private readonly describeParametersCommand: SimSsmDescribeParameters;
  private readonly background: BackgroundScheduler;
  private readonly sdkRouter = new SimSsmSdkCommandRouter(this);

  constructor(properties: SimSsmProperties = {}) {
    const {
      accountRegionScope = simAwsAccountRegionScopeFactory.make(),
      iam = new SimIamAllowAllAuth(),
      background = new BackgroundTasks(),
    } = properties;

    const authorizer = new SimSsmAuthorizer({ iam, accountRegionScope });

    this.background = background;
    this.parameters = new SimSsmParameterStore();
    this.putParameterCommand = new SimSsmPutParameter({
      writer: new SimSsmParameterWriter({
        parameters: this.parameters,
        accountRegionScope,
        clock: background,
      }),
      authorizer,
      accountRegionScope,
    });
    this.readCommands = new SimSsmGetParameterCommands({
      parameters: this.parameters,
      authorizer,
    });
    this.pathCommand = new SimSsmGetParametersByPath({
      parameters: this.parameters,
      authorizer,
      accountRegionScope,
    });
    this.deletionCommands = new SimSsmDeleteParameterCommands({
      parameters: this.parameters,
      authorizer,
    });
    this.describeParametersCommand = new SimSsmDescribeParameters({
      parameters: this.parameters,
      authorizer,
    });
  }

  /**
   * Find a parameter by name, with or without its leading slash.
   *
   * This is the simulator's own accessor, for tests seeding or inspecting
   * parameter state without going through a Command and its authorization.
   */
  findParameter(name: string): SimSsmParameter | undefined {
    return this.parameters.find(name);
  }

  /**
   * Handle a PutParameter Command from the SDK.
   */
  async putParameter(
    command: simSsmCommands.SimPutParameterCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimPutParameterCommandOutput> {
    await this.background.sequence();
    return this.putParameterCommand.handle(command, options);
  }

  /**
   * Handle a GetParameter Command from the SDK.
   */
  async getParameter(
    command: simSsmCommands.SimGetParameterCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimGetParameterCommandOutput> {
    await this.background.sequence();
    return this.readCommands.get(command, options);
  }

  /**
   * Handle a GetParameters Command from the SDK.
   */
  async getParameters(
    command: simSsmCommands.SimGetParametersCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimGetParametersCommandOutput> {
    await this.background.sequence();
    return this.readCommands.getMany(command, options);
  }

  /**
   * Handle a GetParametersByPath Command from the SDK.
   */
  async getParametersByPath(
    command: simSsmCommands.SimGetParametersByPathCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimGetParametersByPathCommandOutput> {
    await this.background.sequence();
    return this.pathCommand.handle(command, options);
  }

  /**
   * Handle a DeleteParameter Command from the SDK.
   */
  async deleteParameter(
    command: simSsmCommands.SimDeleteParameterCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimDeleteParameterCommandOutput> {
    await this.background.sequence();
    return this.deletionCommands.delete(command, options);
  }

  /**
   * Handle a DeleteParameters Command from the SDK.
   */
  async deleteParameters(
    command: simSsmCommands.SimDeleteParametersCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimDeleteParametersCommandOutput> {
    await this.background.sequence();
    return this.deletionCommands.deleteMany(command, options);
  }

  /**
   * Handle a DescribeParameters Command from the SDK.
   */
  async describeParameters(
    command: simSsmCommands.SimDescribeParametersCommand,
    options?: SimSsmRequestOptions,
  ): Promise<simSsmCommands.SimDescribeParametersCommandOutput> {
    await this.background.sequence();
    return this.describeParametersCommand.handle(command, options);
  }

  /**
   * Get this service's SDK Command router for SDK client interception.
   */
  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }
}
