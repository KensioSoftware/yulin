import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimAcmRegistry } from "../acm/registry/sim-acm-registry.js";
import type { SimAwsCaller } from "../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import type { SimIamInterServiceAuthZ } from "../iam/authorize/sim-iam-inter-service-auth-z.js";
import {
  simIamGlobalServiceRegion,
  simIamInRegion,
} from "../iam/authorize/sim-iam-region-auth-z.js";
import type {
  SimCreateDistributionCommand,
  SimCreateDistributionCommandOutput,
} from "./command/create-distribution/create-distribution.command.js";
import { CreateDistributionCommandHandler } from "./command/create-distribution/create-distribution.handler.js";
import type { SimCloudFrontFunctionMap } from "./command/create-function/create-function.handler.js";
import type {
  SimDeleteDistributionCommand,
  SimDeleteDistributionCommandOutput,
} from "./command/delete-distribution/delete-distribution.command.js";
import { DeleteDistributionCommandHandler } from "./command/delete-distribution/delete-distribution.handler.js";
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
import type { SimCloudFrontCachePolicyRegistry } from "./cache-policy/sim-cf-cache-policy-registry.js";
import { SimCloudFrontRegistry } from "./registry/sim-cloud-front-registry.js";
import type { SimCfDistributionConfigurationState } from "./distribution/sim-cf-distribution-configuration-state.js";
import type { SimCfWebAclResolver } from "./web-acl/sim-cf-web-acl.js";
import type { SimCfEdgeFunctions } from "./edge/sim-cf-edge-functions.js";
import { SimCfKeyValueStoreAccess } from "./key-value-store/sim-cf-key-value-store-access.js";
import { SimCfKeyValueStoreCommands } from "./key-value-store/sim-cf-key-value-store-commands.js";
import { SimCloudFrontKeyValueStoreRegistry } from "./key-value-store/sim-cf-key-value-store-registry.js";
import { SimCloudFrontKeyValueStoreApi } from "./sim-cloudfront-key-value-store.js";
import { SimCffKeyValueStoreUsers } from "./cff/kvs/sim-cff-key-value-store-users.js";
import { SimCfFunctionCommands } from "./cff/sim-cf-function-commands.js";

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
  /** How a Distribution's `WebACLId` is resolved to the web ACL it names. */
  readonly webAclResolver?: SimCfWebAclResolver | undefined;
  /** The Lambda functions a Behavior's `LambdaFunctionAssociations` can run. */
  readonly edgeFunctions?: SimCfEdgeFunctions | undefined;
  readonly background?: BackgroundScheduler;
}

interface SimCloudFrontCommandsProperties extends SimCloudFrontProperties {
  readonly accountId: SimAwsAccountId;
  readonly distributions: SimCloudFrontDistributionMap;
  readonly cloudFrontFunctions: SimCloudFrontFunctionMap;
  readonly originAccessControls: SimCloudFrontOriginAccessControlRegistry;
  readonly responseHeadersPolicies: SimCloudFrontResponseHeadersPolicyRegistry;
  readonly cachePolicies: SimCloudFrontCachePolicyRegistry;
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
 * The commands of one simulated CloudFront, and the state they share.
 *
 * Every command authorizes against the same IAM and works on the same
 * Distribution and Function maps, so the wiring lives here rather than being
 * repeated once per command in the service facade. That keeps SimCloudFront
 * what it should be: state plus delegation.
 */
export class SimCloudFrontCommands {
  /**
   * The key value store commands on the CloudFront client.
   */
  public readonly keyValueStores: SimCfKeyValueStoreCommands;

  /**
   * The key value store data API over those same stores.
   */
  public readonly keyValueStoreApi: SimCloudFrontKeyValueStoreApi;

  /**
   * The Lambda functions this CloudFront's Behaviors can run at the edge.
   *
   * Read by the request pipeline, which invokes one for a viewer event, as
   * well as by the Distribution commands, which check one can be associated.
   */
  public readonly edgeFunctions: SimCfEdgeFunctions | undefined;

  /**
   * The CloudFront Function commands, and the Functions they work on.
   */
  public readonly functions: SimCfFunctionCommands;

  private readonly distributionState: SimCloudFrontDistributionState;
  private readonly configurationState: SimCfDistributionConfigurationState;

  constructor(properties: SimCloudFrontCommandsProperties) {
    const {
      accountId,
      distributions,
      cloudFrontFunctions,
      cloudFrontRegistry = new SimCloudFrontRegistry(),
      s3OriginResolver = emptyCloudFrontS3OriginResolver,
      customOriginDispatcher,
      acmRegistry,
      webAclResolver,
      edgeFunctions,
      background = new BackgroundTasks(),
    } = properties;

    // CloudFront is global rather than Region-scoped, so its requests are made
    // in the Region its one endpoint is in.
    const iam = simIamInRegion(properties.iam, simIamGlobalServiceRegion);
    const keyValueStores = new SimCloudFrontKeyValueStoreRegistry();

    this.edgeFunctions = edgeFunctions;
    this.distributionState = {
      accountId,
      distributions,
      cloudFrontRegistry,
      iam,
      background,
    };
    this.functions = new SimCfFunctionCommands({
      accountId,
      cloudFrontFunctions,
      iam,
      background,
      keyValueStores,
    });
    this.configurationState = {
      s3OriginResolver,
      customOriginDispatcher,
      acmRegistry,
      webAclResolver,
      edgeFunctions,
      originAccessControls: properties.originAccessControls,
      responseHeadersPolicies: properties.responseHeadersPolicies,
      cachePolicies: properties.cachePolicies,
    };
    const keyValueStoreAccess = new SimCfKeyValueStoreAccess({
      accountId,
      stores: keyValueStores,
      iam,
      background,
    });

    // The Functions are what can hold a store open, so they are what the
    // delete command asks before removing one.
    this.keyValueStores = new SimCfKeyValueStoreCommands(
      keyValueStoreAccess,
      new SimCffKeyValueStoreUsers(cloudFrontFunctions),
    );
    this.keyValueStoreApi = new SimCloudFrontKeyValueStoreApi(
      keyValueStoreAccess,
    );
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
      ...this.configurationState,
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
      ...this.configurationState,
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
}
