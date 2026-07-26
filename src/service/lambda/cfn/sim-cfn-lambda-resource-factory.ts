import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimLambda } from "../sim-lambda.js";
import { SimCfnLambdaFunctionCreator } from "./function/sim-cfn-lambda-function-creator.js";
import { SimCfnLambdaUrlCreator } from "./url/sim-cfn-lambda-url-creator.js";

/**
 * CloudFormation Resource factory for simulated Lambda resources.
 */
export class SimLambdaCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly functionCreator: SimCfnLambdaFunctionCreator;
  private readonly urlCreator: SimCfnLambdaUrlCreator;

  constructor(lambda: SimLambda) {
    this.functionCreator = new SimCfnLambdaFunctionCreator({ lambda });
    this.urlCreator = new SimCfnLambdaUrlCreator({ lambda });
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
      default: {
        throw new Error(
          `Unsupported sim Lambda CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
