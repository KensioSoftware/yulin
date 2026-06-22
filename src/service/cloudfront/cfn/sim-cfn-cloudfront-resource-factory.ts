import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnCfDistroCreator } from "./distro/sim-cfn-cf-distro-creator.js";

/**
 * CloudFormation Resource factory for simulated CloudFront resources.
 */
export class SimCloudFrontCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly distroCreator: SimCfnCfDistroCreator;

  constructor(cloudFront: SimCloudFront) {
    this.distroCreator = new SimCfnCfDistroCreator({ cloudFront });
  }

  /**
   * Create a simulated CloudFront resource from a CloudFormation Resource.
   */
  async create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    switch (resourceTypeName) {
      case "Distribution": {
        return await this.distroCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
        );
      }
      default: {
        throw new Error(
          `Unsupported sim CloudFront CloudFormation Resource ${resourceTypeName}`,
        );
      }
    }
  }
}
