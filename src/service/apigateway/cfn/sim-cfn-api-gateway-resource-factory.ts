import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCloudFormationResourceDeleteContext } from "../../cloudformation/resource/sim-cfn-resource.type.js";
import type { SimApiGateway } from "../sim-api-gateway.js";
import { SimCfnRestApiCreator } from "./api/sim-cfn-rest-api-creator.js";
import { SimCfnRestApiAuthorizerCreator } from "./authorizer/sim-cfn-rest-api-authorizer-creator.js";
import { SimCfnRestApiDeploymentCreator } from "./deployment/sim-cfn-rest-api-deployment-creator.js";
import { SimCfnRestApiMethodCreator } from "./method/sim-cfn-rest-api-method-creator.js";
import { SimCfnRestApiResourceCreator } from "./resource/sim-cfn-rest-api-resource-creator.js";
import { SimCfnApiGatewayResourceDeleter } from "./sim-cfn-api-gateway-resource-deleter.js";
import { simCfnApiGatewayUnsupportedReason } from "./sim-cfn-api-gateway-unsupported.js";
import { SimCfnRestApiImports } from "./sim-cfn-rest-api-imports.js";
import { SimCfnRestApiStageCreator } from "./stage/sim-cfn-rest-api-stage-creator.js";

interface SimApiGatewayCfnResourceFactoryProperties {
  readonly apiGateway: SimApiGateway;
}

/**
 * CloudFormation Resource factory for simulated API Gateway REST API
 * resources.
 */
export class SimApiGatewayCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly apiCreator: SimCfnRestApiCreator;
  private readonly resourceCreator: SimCfnRestApiResourceCreator;
  private readonly authorizerCreator: SimCfnRestApiAuthorizerCreator;
  private readonly methodCreator: SimCfnRestApiMethodCreator;
  private readonly deploymentCreator: SimCfnRestApiDeploymentCreator;
  private readonly stageCreator: SimCfnRestApiStageCreator;
  private readonly deleter: SimCfnApiGatewayResourceDeleter;

  constructor(properties: SimApiGatewayCfnResourceFactoryProperties) {
    const withImports = { ...properties, imports: new SimCfnRestApiImports() };

    this.apiCreator = new SimCfnRestApiCreator(withImports);
    this.resourceCreator = new SimCfnRestApiResourceCreator(withImports);
    this.authorizerCreator = new SimCfnRestApiAuthorizerCreator(properties);
    this.methodCreator = new SimCfnRestApiMethodCreator(withImports);
    this.deploymentCreator = new SimCfnRestApiDeploymentCreator(properties);
    this.stageCreator = new SimCfnRestApiStageCreator(properties);
    this.deleter = new SimCfnApiGatewayResourceDeleter(properties);
  }

  /**
   * Create a simulated API Gateway REST API resource from a CloudFormation
   * Resource.
   *
   * API keys, usage plans, request validators, models, custom domain names
   * and the Account-wide CloudWatch role are all reported as unsupported
   * rather than quietly treated as deployed. CDK writes the
   * `Account` Resource and its role beside a default `RestApi`, so a stack
   * carrying one deploys with that Resource recorded and the API served.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    switch (resourceTypeName) {
      case "RestApi": {
        return await this.apiCreator.create(resource, properties);
      }
      case "Resource": {
        return await this.resourceCreator.create(resource, properties);
      }
      case "Authorizer": {
        return await this.authorizerCreator.create(resource, properties);
      }
      case "Method": {
        return await this.methodCreator.create(resource, properties);
      }
      case "Deployment": {
        return await this.deploymentCreator.create(resource, properties);
      }
      case "Stage": {
        return await this.stageCreator.create(resource, properties);
      }
      default: {
        throw new Error(
          `Unsupported sim API Gateway CloudFormation Resource ${resourceTypeName}${simCfnApiGatewayUnsupportedReason(resourceTypeName)}`,
        );
      }
    }
  }

  /**
   * Delete a simulated API Gateway REST API resource created from a
   * CloudFormation Resource.
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
    );
  }
}
