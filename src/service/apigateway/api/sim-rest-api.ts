import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimRestApiAuthorizerStore } from "./authorizer/sim-rest-api-authorizer-store.js";
import type { SimRestApiUserPools } from "./authorizer/sim-rest-api-user-pools.js";
import { SimRestApiDeploymentStore } from "./deployment/sim-rest-api-deployment-store.js";
import { SimRestApiResourceStore } from "./resource/sim-rest-api-resource-store.js";
import type { SimRestApiResource } from "./resource/sim-rest-api-resource.js";
import { SimApiGatewayNotFound } from "../error/sim-api-gateway.error.js";
import { SimRestApiStageStore } from "./stage/sim-rest-api-stage-store.js";
import {
  type SimRestApiMatch,
  SimRestApiMatcher,
  type SimRestApiMiss,
} from "./match/sim-rest-api-match.js";
import type { SimRestApiRequest } from "./match/sim-rest-api-request.js";
import { simRestApiHost } from "./sim-rest-api-host.js";
import type { SimRestApiId } from "./sim-rest-api-id.js";
import { simRestApiView, type SimRestApiView } from "./sim-rest-api-view.js";

interface SimRestApiProperties {
  readonly apiId: SimRestApiId;
  readonly name: string;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly createdDate: Date;
  readonly userPools: SimRestApiUserPools;
  readonly description?: string | undefined;
  readonly disableExecuteApiEndpoint?: boolean | undefined;
}

/**
 * A simulated API Gateway REST API.
 *
 * The API is the aggregate root for everything under it. Resources,
 * deployments and stages are all addressed by a `restApiId` on real AWS and
 * cannot exist without one, so they are owned here rather than kept in
 * service-level maps that would have to carry the id around with them. Methods
 * and their integrations hang off a resource for the same reason.
 */
export class SimRestApi {
  public readonly apiId: SimRestApiId;
  public readonly accountRegionScope: SimAwsAccountRegionScope;
  public readonly createdDate: Date;
  public readonly disableExecuteApiEndpoint: boolean;

  /**
   * The user pools this API's Cognito authorizers verify tokens against.
   *
   * They are held on the API because a request is served without a command,
   * and the serving layer reaches the API and nothing around it.
   */
  public readonly userPools: SimRestApiUserPools;

  /**
   * The API's name and description, which `UpdateRestApi` can replace. Neither
   * identifies the API, and two APIs in one Account and Region may share both.
   */
  public name: string;
  public description?: string | undefined;

  public readonly resources = new SimRestApiResourceStore();
  public readonly authorizers = new SimRestApiAuthorizerStore();
  public readonly deployments = new SimRestApiDeploymentStore();
  public readonly stages = new SimRestApiStageStore();

  private readonly matcher = new SimRestApiMatcher();

  constructor(properties: SimRestApiProperties) {
    this.apiId = properties.apiId;
    this.name = properties.name;
    this.accountRegionScope = properties.accountRegionScope;
    this.createdDate = properties.createdDate;
    this.userPools = properties.userPools;
    this.description = properties.description;
    this.disableExecuteApiEndpoint =
      properties.disableExecuteApiEndpoint ?? false;
  }

  /**
   * The root resource of this API's path tree.
   */
  get rootResource(): SimRestApiResource {
    return this.resources.root;
  }

  /**
   * The hostname of the endpoint API Gateway generates for this API.
   */
  get hostname(): string {
    return simRestApiHost({
      apiId: this.apiId,
      regionName: this.accountRegionScope.regionName,
    });
  }

  /**
   * The URL a request to one stage of this API goes to.
   *
   * This is a simulator accessor rather than something a command returns. The
   * REST API reports no endpoint of its own, because a REST API is reachable
   * only through a stage, and AWS leaves callers to build the URL themselves.
   */
  invokeUrl(stageName: string): string {
    return `https://${this.hostname}/${stageName}`;
  }

  /**
   * Find what should handle one request to this API, or why nothing does.
   */
  match(request: SimRestApiRequest): SimRestApiMatch | SimRestApiMiss {
    return this.matcher.match(this, request);
  }

  /**
   * Get a resource of this API by id, refusing an id the tree has no node for.
   *
   * Every command addressing a resource, a method or an integration starts
   * here, since all three are reached through a resource id.
   */
  requireResource(resourceId: string): SimRestApiResource {
    const resource = this.resources.find(resourceId);

    if (resource === undefined) {
      throw new SimApiGatewayNotFound(
        `Invalid resource identifier specified: ${resourceId}`,
      );
    }

    return resource;
  }

  /**
   * Get the AWS-like view of this API.
   */
  view(): SimRestApiView {
    return simRestApiView(this);
  }
}
