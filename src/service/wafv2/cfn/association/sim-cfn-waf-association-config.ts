import { SimCfnWafResourceConfig } from "../sim-cfn-waf-resource-config.js";
import { wafWebAclAssociationResourceType } from "../sim-cfn-waf-resource-types.js";

/**
 * Reads an AWS::WAFv2::WebACLAssociation Resource into the two ARNs it names.
 *
 * Both are required, and neither is read for what it names. `ResourceArn` goes
 * to AssociateWebACL as the template wrote it, so a REST API stage and a user
 * pool are resolved by the same reader an SDK caller's association goes
 * through, and an ARN naming something WAF does not protect — or something
 * Yulin does not simulate — is refused there with the reason it gives.
 */
export class SimCfnWafAssociationConfig extends SimCfnWafResourceConfig {
  protected override get resourceType(): string {
    return wafWebAclAssociationResourceType;
  }

  /**
   * The resource the web ACL is put in front of.
   */
  resourceArn(): string {
    return this.required("ResourceArn");
  }

  /**
   * The web ACL to put in front of it.
   */
  webAclArn(): string {
    return this.required("WebACLArn");
  }

  private required(key: string): string {
    return this.text(key) ?? this.refuse(`${key} is required`);
  }
}
