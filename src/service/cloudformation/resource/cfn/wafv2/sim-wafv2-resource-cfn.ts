import type { SimWafResource } from "../../../../wafv2/resource/sim-waf-resource.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

/**
 * The physical id CloudFormation gives a WAFv2 resource.
 *
 * WAFv2 resources are registry types with a composite primary identifier, so
 * `Ref` gives back the name, the id and the scope joined by pipes rather than
 * the id or the ARN on its own. It reads oddly beside every other service, and
 * it is what a template writing a `Ref` into an output gets on AWS.
 */
export function simWafPhysicalId(resource: SimWafResource): string {
  return [resource.name, resource.id, resource.scope].join("|");
}

interface SimWafSetCfnProperties {
  readonly resource: SimWafResource;
  readonly resourceType: string;
}

/**
 * CloudFormation-facing values for a simulated IP set or regex pattern set.
 *
 * Both publish the same two attributes over the same resource shape, so one
 * adapter covers them and carries the Resource type only to name it in a
 * refusal. The web ACL has two attributes more and has its own adapter.
 */
export class SimWafSetCfn implements SimCfnResourceValueAdapter {
  readonly #resource: SimWafResource;
  readonly #resourceType: string;

  constructor(properties: SimWafSetCfnProperties) {
    this.#resource = properties.resource;
    this.#resourceType = properties.resourceType;
  }

  /**
   * AWS::WAFv2::IPSet and AWS::WAFv2::RegexPatternSet Ref both return the
   * physical id, which is `<name>|<id>|<scope>`.
   */
  refValue(): SimCfnTemplateValue {
    return simWafPhysicalId(this.#resource);
  }

  /**
   * The two attributes a set publishes.
   *
   * A rule referring to a set names it by ARN, which is why `Arn` is the one
   * that gets used. `Scope` is no attribute on AWS, even though it is part of
   * the physical id.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.#resource.arn;
      }
      case "Id": {
        return this.#resource.id;
      }
      default: {
        throw new Error(
          `Unsupported ${this.#resourceType} attribute ${attributeName}`,
        );
      }
    }
  }
}
