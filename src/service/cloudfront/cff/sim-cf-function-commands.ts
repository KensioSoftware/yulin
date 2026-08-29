import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "../command/create-function/create-function.command.js";
import {
  CreateFunctionCommandHandler,
  type SimCloudFrontFunctionMap,
} from "../command/create-function/create-function.handler.js";
import type {
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput,
} from "../command/delete-function/delete-function.command.js";
import { DeleteFunctionCommandHandler } from "../command/delete-function/delete-function.handler.js";
import { SimCfDescribeFunction } from "../command/function/sim-cf-describe-function.js";
import { SimCfFunctionAccess } from "../command/function/sim-cf-function-access.js";
import type {
  SimDescribeFunctionCommand,
  SimDescribeFunctionCommandOutput,
  SimGetFunctionCommand,
  SimGetFunctionCommandOutput,
  SimListFunctionsCommand,
  SimListFunctionsCommandOutput,
} from "../command/function/sim-cf-function-command.types.js";
import { SimCfGetFunction } from "../command/function/sim-cf-get-function.js";
import { SimCfListFunctions } from "../command/function/sim-cf-list-functions.js";
import type { SimCloudFrontKeyValueStoreRegistry } from "../key-value-store/sim-cf-key-value-store-registry.js";

interface SimCfFunctionCommandsProperties {
  readonly accountId: SimAwsAccountId;
  readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
  readonly keyValueStores: SimCloudFrontKeyValueStoreRegistry;
}

interface FunctionRequestOptions {
  readonly caller?: SimAwsCaller;
}

/**
 * The CloudFront Function commands on the CloudFront client.
 *
 * They are grouped here rather than beside the Distribution commands on
 * SimCloudFrontCommands because they work on their own state, the Account's
 * Functions, and because there are enough of them to be their own thing.
 */
export class SimCfFunctionCommands {
  private readonly writeState: SimCfFunctionCommandsProperties;
  private readonly access: SimCfFunctionAccess;

  constructor(properties: SimCfFunctionCommandsProperties) {
    this.writeState = properties;
    this.access = new SimCfFunctionAccess(properties);
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: SimCreateFunctionCommand,
    options?: FunctionRequestOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    return await new CreateFunctionCommandHandler(this.writeState).handle(
      command,
      options,
    );
  }

  /**
   * Handle a Delete Function Command from the SDK.
   */
  async deleteFunction(
    command: SimDeleteFunctionCommand,
    options?: FunctionRequestOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    return await new DeleteFunctionCommandHandler(this.writeState).handle(
      command,
      options,
    );
  }

  /**
   * Handle a List Functions Command from the SDK.
   */
  async listFunctions(
    command: SimListFunctionsCommand,
    options?: FunctionRequestOptions,
  ): Promise<SimListFunctionsCommandOutput> {
    return await new SimCfListFunctions(this.access).handle(command, options);
  }

  /**
   * Handle a Describe Function Command from the SDK.
   */
  async describeFunction(
    command: SimDescribeFunctionCommand,
    options?: FunctionRequestOptions,
  ): Promise<SimDescribeFunctionCommandOutput> {
    return await new SimCfDescribeFunction(this.access).handle(
      command,
      options,
    );
  }

  /**
   * Handle a Get Function Command from the SDK.
   */
  async getFunction(
    command: SimGetFunctionCommand,
    options?: FunctionRequestOptions,
  ): Promise<SimGetFunctionCommandOutput> {
    return await new SimCfGetFunction(this.access).handle(command, options);
  }
}
