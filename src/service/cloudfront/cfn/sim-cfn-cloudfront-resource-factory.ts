import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type { SimCloudFront } from "../sim-cloudfront.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnCfDistroCreator } from "./distro/sim-cfn-cf-distro-creator.js";
import { SimCfnCffCreator } from "./cff/sim-cfn-cff-creator.js";
import { SimCfnCfDistroDeleter } from "./distro/sim-cfn-cf-distro-deleter.js";
import { SimCfnCfResponseHeadersPolicyCreator } from "./response-headers-policy/sim-cfn-cf-rh-policy-creator.js";
import type { SimCloudFrontFunction } from "../cff/sim-cloudfront-function.js";
import { assertDefined } from "../../../util/type-guard/defined.js";

/**
 * CloudFormation Resource factory for simulated CloudFront resources.
 */
export class SimCloudFrontCloudFormationResourceFactory implements SimCfnServiceResourceFactory {
  private readonly cloudFront: SimCloudFront;
  private readonly distroCreator: SimCfnCfDistroCreator;
  private readonly functionCreator: SimCfnCffCreator;
  private readonly distroDeleter: SimCfnCfDistroDeleter;
  private readonly responseHeadersPolicyCreator: SimCfnCfResponseHeadersPolicyCreator;

  constructor(cloudFront: SimCloudFront) {
    this.cloudFront = cloudFront;
    this.distroCreator = new SimCfnCfDistroCreator({ cloudFront });
    this.functionCreator = new SimCfnCffCreator({ cloudFront });
    this.distroDeleter = new SimCfnCfDistroDeleter({ cloudFront });
    this.responseHeadersPolicyCreator =
      new SimCfnCfResponseHeadersPolicyCreator({ cloudFront });
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
      case "Function": {
        return await this.functionCreator.create(
          resource,
          context.resolvedProperties ?? resource.properties,
          context,
        );
      }
      case "ResponseHeadersPolicy": {
        return this.responseHeadersPolicyCreator.create(
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

  /**
   * Delete a simulated CloudFront resource created from a CloudFormation
   * Resource.
   */
  async delete(
    resourceTypeName: string,
    resource: SimCfnResource,
  ): Promise<void> {
    switch (resourceTypeName) {
      case "Distribution": {
        await this.distroDeleter.delete(resource);
        return;
      }
      case "Function": {
        await this.deleteFunction(resource);
        return;
      }
      case "ResponseHeadersPolicy": {
        this.responseHeadersPolicyCreator.delete(resource);
        return;
      }
      default: {
        throw new Error(
          `Unsupported sim CloudFront CloudFormation Resource ${resourceTypeName} deletion`,
        );
      }
    }
  }

  private async deleteFunction(resource: SimCfnResource): Promise<void> {
    const cloudFrontFunction = resource.simResource as
      | SimCloudFrontFunction
      | undefined;
    assertDefined(
      cloudFrontFunction,
      `sim CloudFront Function for CloudFormation Resource ${resource.logicalId}`,
    );

    await this.cloudFront.deleteFunction({
      input: { Name: cloudFrontFunction.name },
    });
  }
}
