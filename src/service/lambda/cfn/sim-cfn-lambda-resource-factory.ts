import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimLambda } from "../sim-lambda.js";
import { SimCfnLambdaEventSourceMappingCreator } from "./event-source-mapping/sim-cfn-lambda-event-source-mapping-creator.js";
import { SimCfnLambdaFunctionCreator } from "./function/sim-cfn-lambda-function-creator.js";
import { SimCfnLambdaPermissionCreator } from "./permission/sim-cfn-lambda-permission-creator.js";
import { SimCfnLambdaUrlCreator } from "./url/sim-cfn-lambda-url-creator.js";
import { SimCfnLambdaResourceDeleter } from "./sim-cfn-lambda-resource-deleter.js";

/**
 * CloudFormation Resource factory for simulated Lambda resources.
 */
export class SimLambdaCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly functionCreator: SimCfnLambdaFunctionCreator;
  private readonly urlCreator: SimCfnLambdaUrlCreator;
  private readonly permissionCreator: SimCfnLambdaPermissionCreator;
  private readonly eventSourceMappingCreator: SimCfnLambdaEventSourceMappingCreator;
  private readonly deleter: SimCfnLambdaResourceDeleter;

  constructor(lambda: SimLambda) {
    this.deleter = new SimCfnLambdaResourceDeleter({ lambda });
    this.functionCreator = new SimCfnLambdaFunctionCreator({ lambda });
    this.urlCreator = new SimCfnLambdaUrlCreator({ lambda });
    this.permissionCreator = new SimCfnLambdaPermissionCreator({ lambda });
    this.eventSourceMappingCreator = new SimCfnLambdaEventSourceMappingCreator({
      lambda,
    });
  }

  /**
   * Create a simulated Lambda resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Function": {
        return await this.functionCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
          context.bindings,
        );
      }
      case "Url": {
        return await this.urlCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "EventSourceMapping": {
        return await this.eventSourceMappingCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      case "Permission": {
        return await this.permissionCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim Lambda CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }

  /**
   * Delete a simulated Lambda resource created from a CloudFormation Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    await this.deleter.delete(resourceTypeName, resource);
  }
}
