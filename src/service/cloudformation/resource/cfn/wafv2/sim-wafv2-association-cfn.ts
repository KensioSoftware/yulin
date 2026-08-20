import type { SimWafCfnWebAclAssociation } from "../../../../wafv2/cfn/association/sim-cfn-waf-web-acl-association.js";
import type { SimCfnTemplateValue } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnResourceValueAdapter } from "../sim-cfn-resource-value-adapter.js";

interface SimWafWebAclAssociationCfnProperties {
  readonly association: SimWafCfnWebAclAssociation;
}

/**
 * CloudFormation-facing values for a simulated web ACL association.
 */
export class SimWafWebAclAssociationCfn implements SimCfnResourceValueAdapter {
  readonly #association: SimWafCfnWebAclAssociation;

  constructor(properties: SimWafWebAclAssociationCfnProperties) {
    this.#association = properties.association;
  }

  /**
   * AWS::WAFv2::WebACLAssociation Ref returns the physical id, which is the
   * two ARNs it was made from joined by a pipe.
   *
   * The association has no identifier of its own on AWS either. What it is is
   * the pair.
   */
  refValue(): SimCfnTemplateValue {
    return `${this.#association.resourceArn}|${this.#association.webAclArn}`;
  }

  /**
   * AWS::WAFv2::WebACLAssociation publishes no Fn::GetAtt attributes.
   */
  attributeValue(attributeName: string): SimCfnTemplateValue {
    throw new Error(
      `Unsupported AWS::WAFv2::WebACLAssociation attribute ${attributeName}`,
    );
  }
}
