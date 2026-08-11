import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAcmRegistry } from "../acm/registry/sim-acm-registry.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import {
  SimIamAllowAllAuth,
  type SimIamInterServiceAuthZ,
} from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./command/create-distribution/create-distribution.command.js";
import { CreateDistributionCommandHandler } from "./command/create-distribution/create-distribution.handler.js";
import type {
  SimCreateFunctionCommand,
  SimCreateFunctionCommandOutput,
} from "./command/create-function/create-function.command.js";
import {
  CreateFunctionCommandHandler,
  type SimCloudFrontFunctionMap,
} from "./command/create-function/create-function.handler.js";
import type {
  SimDeleteDistributionCommand,
  SimDeleteDistributionCommandOutput,
} from "./command/delete-distribution/delete-distribution.command.js";
import { DeleteDistributionCommandHandler } from "./command/delete-distribution/delete-distribution.handler.js";
import type {
  SimDeleteFunctionCommand,
  SimDeleteFunctionCommandOutput,
} from "./command/delete-function/delete-function.command.js";
import { DeleteFunctionCommandHandler } from "./command/delete-function/delete-function.handler.js";
import type {
  SimGetDistributionCommand,
  SimGetDistributionCommandOutput,
} from "./command/get-distribution/get-distribution.command.js";
import { GetDistributionCommandHandler } from "./command/get-distribution/get-distribution.handler.js";
import type {
  SimUpdateDistributionCommand,
  SimUpdateDistributionCommandOutput,
} from "./command/update-distribution/update-distribution.command.js";
import { UpdateDistributionCommandHandler } from "./command/update-distribution/update-distribution.handler.js";
import type {
  SimCloudFrontDistribution,
  SimCloudFrontDistributionId,
} from "./distribution/sim-cloudfront-distribution.js";
import type { SimCfCustomOriginDispatcher } from "./origin/custom/sim-cf-custom-origin-dispatcher.js";
import {
  emptyCloudFrontS3OriginResolver,
  type SimCloudFrontS3OriginResolver,
} from "./origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontOriginAccessControlRegistry } from "./origin-access-control/sim-cf-origin-access-control-registry.js";
import type { SimCloudFrontResponseHeadersPolicyRegistry } from "./response-headers-policy/sim-cf-response-headers-policy-registry.js";
import { SimCloudFrontRegistry } from "./registry/sim-cloud-front-registry.js";

/**
 * How one simulated CloudFront is put together.
 */
export interface SimCloudFrontProperties {
  readonly accountRegionScope?: SimAwsAccountRegionScope;
  readonly cloudFrontRegistry?: SimCloudFrontRegistry;
  readonly s3OriginResolver?: SimCloudFrontS3OriginResolver;
  readonly customOriginDispatcher?: SimCfCustomOriginDispatcher | undefined;
  readonly iam?: SimIamInterServiceAuthZ;
  readonly acmRegistry?: SimAcmRegistry | undefined;
  readonly background?: BackgroundScheduler;
}

interface SimCloudFrontCommandsProperties extends SimCloudFrontProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: SimCloudFrontDistributionMap;
  readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
}

/**
 * Options carried by any simulated CloudFront request.
 */
export interface SimCloudFrontRequestOptions {
  readonly caller?: SimAwsCaller;
}

export type SimCloudFrontDistributionMap = Map<
  SimCloudFrontDistributionId,
  SimCloudFrontDistribution
>;

/**
 * The state every Distribution command works on.
 */
interface SimCloudFrontDistributionState {
  readonly accountId: SimAwsAccountId;
  readonly distributions: SimCloudFrontDistributionMap;
  readonly cloudFrontRegistry: SimCloudFrontRegistry;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * The state every CloudFront Function command works on.
 */
interface SimCloudFrontFunctionState {
  readonly accountId: SimAwsAccountId;
  readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  readonly iam: SimIamInterServiceAuthZ;
  readonly background: BackgroundScheduler;
}

/**
 * The commands of one simulated CloudFront, and the state they share.
 *
 * Every command authorizes against the same IAM and works on the same
 * Distribution and Function maps, so the wiring lives here rather than being
 * repeated once per command in the service facade. That keeps SimCloudFront
 * what it should be: state plus delegation.
 */
export class SimCloudFrontCommands {
  private readonly distributionState: SimCloudFrontDistributionState;
  private readonly functionState: SimCloudFrontFunctionState;
  private readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
  private readonly customOriginDispatcher:
    | SimCfCustomOriginDispatcher
    | undefined;
  private readonly acmRegistry: SimAcmRegistry | undefined;
  private readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  private readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;

  constructor(properties: SimCloudFrontCommandsProperties) {
    const {
      accountId,
      distributions,
      cloudFrontFunctions,
      cloudFrontRegistry = new SimCloudFrontRegistry(),
      s3OriginResolver = emptyCloudFrontS3OriginResolver,
      customOriginDispatcher,
      iam = new SimIamAllowAllAuth(),
      acmRegistry,
      background = new BackgroundTasks(),
    } = properties;

    this.distributionState = {
      accountId,
      distributions,
      cloudFrontRegistry,
      iam,
      background,
    };
    this.functionState = {
      accountId,
      cloudFrontFunctions,
      iam,
      background,
    };
    this.s3OriginResolver = s3OriginResolver;
    this.customOriginDispatcher = customOriginDispatcher;
    this.acmRegistry = acmRegistry;
    this.originAccessControls = properties.originAccessControls;
    this.responseHeadersPolicies = properties.responseHeadersPolicies;
  }

  /**
   * Handle a Create Distribution Command from the SDK.
   */
  async createDistribution(
    command: SimCreateDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimCreateDistributionCommandOutput> {
    return await new CreateDistributionCommandHandler({
      ...this.distributionState,
      ...this.originState(),
    }).handle(command, options);
  }

  /**
   * Handle a Get Distribution Command from the SDK.
   */
  async getDistribution(
    command: SimGetDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimGetDistributionCommandOutput> {
    return await new GetDistributionCommandHandler(
      this.distributionState,
    ).handle(command, options);
  }

  /**
   * Handle an Update Distribution Command from the SDK.
   */
  async updateDistribution(
    command: SimUpdateDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimUpdateDistributionCommandOutput> {
    return await new UpdateDistributionCommandHandler({
      ...this.distributionState,
      ...this.originState(),
    }).handle(command, options);
  }

  /**
   * Handle a Delete Distribution Command from the SDK.
   */
  async deleteDistribution(
    command: SimDeleteDistributionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimDeleteDistributionCommandOutput> {
    return await new DeleteDistributionCommandHandler(
      this.distributionState,
    ).handle(command, options);
  }

  /**
   * Handle a Create Function Command from the SDK.
   */
  async createFunction(
    command: SimCreateFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimCreateFunctionCommandOutput> {
    return await new CreateFunctionCommandHandler(this.functionState).handle(
      command,
      options,
    );
  }

  /**
   * Handle a Delete Function Command from the SDK.
   */
  async deleteFunction(
    command: SimDeleteFunctionCommand,
    options?: SimCloudFrontRequestOptions,
  ): Promise<SimDeleteFunctionCommandOutput> {
    return await new DeleteFunctionCommandHandler(this.functionState).handle(
      command,
      options,
    );
  }

  /**
   * How the commands that configure a Distribution reach its Origins.
   */
  private originState(): {
    readonly s3OriginResolver: SimCloudFrontS3OriginResolver;
    readonly customOriginDispatcher: SimCfCustomOriginDispatcher | undefined;
    readonly acmRegistry: SimAcmRegistry | undefined;
    readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
    readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
  } {
    return {
      s3OriginResolver: this.s3OriginResolver,
      customOriginDispatcher: this.customOriginDispatcher,
      acmRegistry: this.acmRegistry,
      originAccessControls: this.originAccessControls,
      responseHeadersPolicies: this.responseHeadersPolicies,
    };
  }
}
