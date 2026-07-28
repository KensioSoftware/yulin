import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import type { SimSsm } from "../sim-ssm.js";
import { SimCfnSsmParameterCreator } from "./parameter/sim-cfn-ssm-parameter-creator.js";

interface SimSsmCfnResourceFactoryProperties {
  readonly ssm: SimSsm;
}

/**
 * CloudFormation Resource factory for simulated SSM resources.
 */
export class SimSsmCfnResourceFactory implements SimCfnServiceResourceFactory {
  private readonly parameterCreator: SimCfnSsmParameterCreator;

  constructor(properties: SimSsmCfnResourceFactoryProperties) {
    this.parameterCreator = new SimCfnSsmParameterCreator({
      ssm: properties.ssm,
    });
  }

  /**
   * Create a simulated SSM resource from a CloudFormation Resource.
   *
   * Parameter Store is the only part of Systems Manager this simulation
   * models, so the rest of the AWS::SSM::* Resource types are reported as
   * unsupported and skipped rather than quietly treated as deployed.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Parameter": {
        return await this.parameterCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim SSM CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
