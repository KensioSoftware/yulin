import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";
import { SimCfnHttpApiCreator } from "./api/sim-cfn-http-api-creator.js";
import { SimCfnHttpApiIntegrationCreator } from "./integration/sim-cfn-http-api-integration-creator.js";
import { SimCfnHttpApiRouteCreator } from "./route/sim-cfn-http-api-route-creator.js";
import { SimCfnHttpApiStageCreator } from "./stage/sim-cfn-http-api-stage-creator.js";

/**
 * The Resource types belonging to a WebSocket API, which is the half of API
 * Gateway v2 this simulation does not model at all.
 */
const webSocketResourceTypeNames = new Set([
  "Model",
  "RouteResponse",
  "IntegrationResponse",
]);

interface SimApiGatewayV2CfnResourceFactoryProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * CloudFormation Resource factory for simulated API Gateway v2 resources.
 */
export class SimApiGatewayV2CfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly apiCreator: SimCfnHttpApiCreator;
  private readonly integrationCreator: SimCfnHttpApiIntegrationCreator;
  private readonly routeCreator: SimCfnHttpApiRouteCreator;
  private readonly stageCreator: SimCfnHttpApiStageCreator;

  constructor(properties: SimApiGatewayV2CfnResourceFactoryProperties) {
    const { apiGatewayV2 } = properties;

    this.apiCreator = new SimCfnHttpApiCreator({ apiGatewayV2 });
    this.integrationCreator = new SimCfnHttpApiIntegrationCreator({
      apiGatewayV2,
    });
    this.routeCreator = new SimCfnHttpApiRouteCreator({ apiGatewayV2 });
    this.stageCreator = new SimCfnHttpApiStageCreator({ apiGatewayV2 });
  }

  /**
   * Create a simulated API Gateway v2 resource from a CloudFormation Resource.
   *
   * Authorizers, deployments, custom domain names and the WebSocket-only
   * Resource types are not simulated, so their Resource types are reported as
   * unsupported rather than quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "Api": {
        return await this.apiCreator.create(resource, properties);
      }
      case "Integration": {
        return await this.integrationCreator.create(resource, properties);
      }
      case "Route": {
        return await this.routeCreator.create(resource, properties, context);
      }
      case "Stage": {
        return await this.stageCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim API Gateway v2 CloudFormation Resource ` +
            `${resourceTypeName}${this.unsupportedReason(resourceTypeName)}`,
        );
      }
    }
  }

  /**
   * Say why a Resource type is unsupported when there is more to say than that
   * nothing creates it yet.
   */
  private unsupportedReason(resourceTypeName: string): string {
    if (webSocketResourceTypeNames.has(resourceTypeName)) {
      return ", which belongs to a WebSocket API and is not simulated";
    }

    return "";
  }
}
