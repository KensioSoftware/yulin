import type { SimWafWebAcl } from "../../../../wafv2/web-acl/sim-waf-web-acl.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";
import { simWafPhysicalId } from "./sim-wafv2-resource-cfn.js";

interface SimWafWebAclCfnProperties {
  readonly webAcl: SimWafWebAcl;
}

/**
 * CloudFormation-facing values for a simulated web ACL.
 */
export class SimWafWebAclCfn implements SimCfnResourceValueAdapter {
  readonly #webAcl: SimWafWebAcl;

  constructor(properties: SimWafWebAclCfnProperties) {
    this.#webAcl = properties.webAcl;
  }

  /**
   * AWS::WAFv2::WebACL Ref returns the physical id, which is
   * `<name>|<id>|<scope>`.
   */
  refValue(): SimCfnTemplateValue {
    return simWafPhysicalId(this.#webAcl);
  }

  /**
   * The four attributes a web ACL publishes.
   *
   * `Arn` is the one everything else in a template wants: an association names
   * a web ACL by ARN, and so does a distribution's `WebACLId`, which is named
   * for WAF Classic and holds a WAFv2 ARN.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    switch (attributeName) {
      case "Arn": {
        return this.#webAcl.arn;
      }
      case "Id": {
        return this.#webAcl.id;
      }
      case "Capacity": {
        return this.#webAcl.capacity;
      }
      case "LabelNamespace": {
        return this.#webAcl.labelNamespace;
      }
      default: {
        throw new Error(
          `Unsupported AWS::WAFv2::WebACL attribute ${attributeName}`,
        );
      }
    }
  }
}
