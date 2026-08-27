import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimApiGatewayV2 } from "../sim-api-gateway-v2.js";
import { SimCfnHttpApiCreator } from "./api/sim-cfn-http-api-creator.js";
import { SimCfnHttpApiAuthorizerCreator } from "./authorizer/sim-cfn-http-api-authorizer-creator.js";
import { SimCfnApiMappingCreator } from "./domain/sim-cfn-api-mapping-creator.js";
import { SimCfnHttpApiDomainCreator } from "./domain/sim-cfn-http-api-domain-creator.js";
import { SimCfnHttpApiIntegrationCreator } from "./integration/sim-cfn-http-api-integration-creator.js";
import { SimCfnHttpApiRouteCreator } from "./route/sim-cfn-http-api-route-creator.js";
import { SimCfnHttpApiImports } from "./sim-cfn-http-api-imports.js";
import { SimCfnHttpApiStageCreator } from "./stage/sim-cfn-http-api-stage-creator.js";
import { SimCfnApiGatewayV2ResourceDeleter } from "./sim-cfn-api-gateway-v2-resource-deleter.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import { simCfnResourceCallerOptions } from "../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";
import { simCfnApiGatewayV2UnsupportedReason } from "./sim-cfn-api-gateway-v2-unsupported.js";

interface SimApiGatewayV2CfnResourceFactoryProperties {
  readonly apiGatewayV2: SimApiGatewayV2;
}

/**
 * CloudFormation Resource factory for simulated API Gateway v2 resources.
 */
export class SimApiGatewayV2CfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly apiCreator: SimCfnHttpApiCreator;
  private readonly authorizerCreator: SimCfnHttpApiAuthorizerCreator;
  private readonly integrationCreator: SimCfnHttpApiIntegrationCreator;
  private readonly routeCreator: SimCfnHttpApiRouteCreator;
  private readonly stageCreator: SimCfnHttpApiStageCreator;
  private readonly domainCreator: SimCfnHttpApiDomainCreator;
  private readonly mappingCreator: SimCfnApiMappingCreator;
  private readonly deleter: SimCfnApiGatewayV2ResourceDeleter;

  constructor(properties: SimApiGatewayV2CfnResourceFactoryProperties) {
    const { apiGatewayV2 } = properties;
    const imports = new SimCfnHttpApiImports();

    this.apiCreator = new SimCfnHttpApiCreator({ apiGatewayV2, imports });
    this.authorizerCreator = new SimCfnHttpApiAuthorizerCreator({
      apiGatewayV2,
      imports,
    });
    this.integrationCreator = new SimCfnHttpApiIntegrationCreator({
      apiGatewayV2,
      imports,
    });
    this.routeCreator = new SimCfnHttpApiRouteCreator({
      apiGatewayV2,
      imports,
    });
    this.stageCreator = new SimCfnHttpApiStageCreator({ apiGatewayV2 });
    this.domainCreator = new SimCfnHttpApiDomainCreator({ apiGatewayV2 });
    this.mappingCreator = new SimCfnApiMappingCreator({ apiGatewayV2 });
    this.deleter = new SimCfnApiGatewayV2ResourceDeleter({ apiGatewayV2 });
  }

  /**
   * Create a simulated API Gateway v2 resource from a CloudFormation Resource.
   *
   * Deployments, VPC links and the WebSocket-only Resource types are not
   * simulated, so their Resource types are reported as unsupported rather than
   * quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const values = context.resolvedProperties ?? resource.properties;
    const options = simCfnResourceCallerOptions(context.caller);

    switch (resourceTypeName) {
      case "Api": {
        return await this.apiCreator.create(resource, values, options);
      }
      case "Authorizer": {
        return await this.authorizerCreator.create(resource, values, options);
      }
      case "Integration": {
        return await this.integrationCreator.create(resource, values, options);
      }
      case "Route": {
        return await this.routeCreator.create(resource, values, options);
      }
      case "Stage": {
        return await this.stageCreator.create(resource, values, options);
      }
      case "DomainName": {
        return await this.domainCreator.create(resource, values, options);
      }
      case "ApiMapping": {
        return await this.mappingCreator.create(resource, values, options);
      }
      default: {
        throw new Error(
          `Unsupported sim API Gateway v2 CloudFormation Resource ` +
            `${resourceTypeName}${simCfnApiGatewayV2UnsupportedReason(resourceTypeName)}`,
        );
      }
    }
  }

  /**
   * Delete a simulated API Gateway v2 resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceDeleteContext,
  ): Promise<void> {
    await this.deleter.delete(
      resourceTypeName,
      resource,
      context.resolvedProperties ?? resource.properties,
      simCfnResourceCallerOptions(context.caller),
    );
  }
}
