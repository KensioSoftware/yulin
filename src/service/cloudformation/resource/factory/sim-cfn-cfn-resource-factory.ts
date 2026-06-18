import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../sim-cfn-resource.js";
import type { SimCfnServiceResourceFactory } from "./sim-cfn-resource-factory.type.js";

/**
 * Simulated AWS::CloudFormation::WaitConditionHandle resource.
 *
 * This acts as an example resource for testing sim CloudFormation without
 * involving other sim services.
 */
export class SimCloudFormationWaitConditionHandle {
  constructor(public readonly resource: SimCfnResource) {}
}

/**
 * CloudFormation Resource factory for simulated CloudFormation resources such
 * as AWS::CloudFormation::WaitConditionHandle.
 */
export class SimCfnCfnResourceFactory implements SimCfnServiceResourceFactory {
  /**
   * Create a simulated CloudFormation resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    void context;

    await Promise.resolve();

    switch (resourceTypeName) {
      case "WaitConditionHandle": {
        return new SimCloudFormationWaitConditionHandle(resource);
      }
      default: {
        throw new Error(
          `Unsupported sim CloudFormation CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
