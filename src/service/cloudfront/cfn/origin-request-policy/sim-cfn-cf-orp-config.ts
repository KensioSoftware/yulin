import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontOriginRequestPolicy } from "../../origin-request-policy/sim-cf-origin-request-policy.js";

/**
 * Reads an AWS::CloudFront::OriginRequestPolicy Resource into a simulated
 * policy.
 *
 * `Name` and `Comment` are what the policy carries. The header, cookie and
 * query string sections are read past: what they configure is a narrowing of
 * the origin request this simulation has yet to grow. A Resource missing its
 * `Name` is refused, as CloudFormation refuses one.
 */
export class SimCfnCfOriginRequestPolicyConfig {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = properties.properties;
  }

  /**
   * Build the simulated policy this Resource describes.
   */
  build(): SimCloudFrontOriginRequestPolicy {
    const config = this.properties["OriginRequestPolicyConfig"];

    if (!isRecord(config)) {
      return this.refuse("OriginRequestPolicyConfig must be an object");
    }

    const name = config["Name"];

    if (typeof name !== "string") {
      return this.refuse("OriginRequestPolicyConfig needs a string Name");
    }

    const comment = config["Comment"];

    return new SimCloudFrontOriginRequestPolicy({
      name,
      ...(typeof comment === "string" && { comment }),
    });
  }

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private refuse(detail: string): never {
    throw new Error(
      `Invalid AWS::CloudFront::OriginRequestPolicy ${this.resource.logicalId}: ${detail}`,
    );
  }
}
