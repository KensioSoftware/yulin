import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontResponseHeadersPolicy } from "../../response-headers-policy/sim-cf-response-headers-policy.js";
import { simCfnCfResponseHeadersPolicyCors } from "./sim-cfn-cf-rh-policy-cors-config.js";
import {
  simCfnCfResponseHeadersPolicyCustomHeaders,
  simCfnCfResponseHeadersPolicyRemoveHeaders,
} from "./sim-cfn-cf-rh-policy-custom-headers.js";
import {
  requiredString,
  type SimCfnCfRhPolicyFieldRefuse,
} from "./sim-cfn-cf-rh-policy-field-reader.js";
import { simCfnCfResponseHeadersPolicySecurityHeaders } from "./sim-cfn-cf-rh-policy-security-headers.js";
import { simCfnCfResponseHeadersPolicyServerTiming } from "./sim-cfn-cf-rh-policy-server-timing.js";

/**
 * Reads an AWS::CloudFront::ResponseHeadersPolicy Resource into a simulated
 * policy.
 *
 * Every section is read by its own function in this directory, each taking
 * the whole config and finding its own section in it. This class only says
 * which sections a policy has, and carries the refusal that names the
 * Resource whichever section could not be read.
 */
export class SimCfnCfResponseHeadersPolicyConfig {
  private readonly resource: SimCfnResource;
  private readonly properties: SimCfnTemplateValueRecord;

  /**
   * Refuse this Resource, saying which part of it could not be read.
   */
  private readonly refuse: SimCfnCfRhPolicyFieldRefuse = (detail) => {
    throw new Error(
      `Invalid AWS::CloudFront::ResponseHeadersPolicy ${this.resource.logicalId}: ${detail}`,
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
  build(): SimCloudFrontResponseHeadersPolicy {
    const { refuse } = this;
    const config = this.properties["ResponseHeadersPolicyConfig"];

    if (!isRecord(config)) {
      return refuse(`ResponseHeadersPolicyConfig must be an object`);
    }

    return new SimCloudFrontResponseHeadersPolicy({
      name: requiredString(
        config,
        "Name",
        "ResponseHeadersPolicyConfig",
        refuse,
      ),
      customHeaders: simCfnCfResponseHeadersPolicyCustomHeaders(config, refuse),
      headersToRemove: simCfnCfResponseHeadersPolicyRemoveHeaders(
        config,
        refuse,
      ),
      securityHeaders: simCfnCfResponseHeadersPolicySecurityHeaders(
        config,
        refuse,
      ),
      serverTiming: simCfnCfResponseHeadersPolicyServerTiming(config, refuse),
      cors: simCfnCfResponseHeadersPolicyCors(config, refuse),
    });
  }
}
