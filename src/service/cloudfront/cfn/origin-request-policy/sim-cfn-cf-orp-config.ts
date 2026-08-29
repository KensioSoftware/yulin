import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontOriginRequestPolicy } from "../../origin-request-policy/sim-cf-origin-request-policy.js";
import type { SimCfnCfPolicyRefuse } from "../policy/sim-cfn-cf-policy-section.js";
import { simCfnCfOriginRequestForwarding } from "./sim-cfn-cf-orp-forwarding.js";

/**
 * Reads an AWS::CloudFront::OriginRequestPolicy Resource into a simulated
 * policy.
 *
 * The policy carries its `Name`, its `Comment` and the three sections that say
 * what it forwards to the Origin. A section a template left out falls back to
 * CloudFront's `none`. A Resource missing its `Name` is refused, as
 * CloudFormation refuses one.
 */
export class SimCfnCfOriginRequestPolicyConfig {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private readonly refuse: SimCfnCfPolicyRefuse = (detail) => {
    throw new Error(
      `Invalid AWS::CloudFront::OriginRequestPolicy ${this.resource.logicalId}: ${detail}`,
    );
  };

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
    const { refuse } = this;
    const config = this.properties["OriginRequestPolicyConfig"];

    if (!isRecord(config)) {
      return refuse("OriginRequestPolicyConfig must be an object");
    }

    const name = config["Name"];

    if (typeof name !== "string") {
      return refuse("OriginRequestPolicyConfig needs a string Name");
    }

    const comment = config["Comment"];

    return new SimCloudFrontOriginRequestPolicy({
      name,
      ...(typeof comment === "string" && { comment }),
      forwarding: simCfnCfOriginRequestForwarding(config, refuse),
    });
  }
}
