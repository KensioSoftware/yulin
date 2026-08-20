import type { SimCreateIpSetCommandInput } from "../../command/ip-set/ip-set.command.js";
import { SimCfnWafResourceConfig } from "../sim-cfn-waf-resource-config.js";
import { wafIpSetResourceType } from "../sim-cfn-waf-resource-types.js";

/**
 * Reads an AWS::WAFv2::IPSet Resource into what CreateIPSet takes.
 *
 * Both properties of a set are required by the CloudFormation schema, so one
 * missing is a template AWS refuses before an IP set is reached. They are
 * handed over as the template wrote them and checked by CreateIPSet, which is
 * where an address that is not CIDR notation is refused.
 */
export class SimCfnWafIpSetConfig extends SimCfnWafResourceConfig {
  protected override get resourceType(): string {
    return wafIpSetResourceType;
  }

  /**
   * The input the IP set this Resource describes is created from.
   */
  createInput(): SimCreateIpSetCommandInput {
    return {
      Name: this.name(),
      Scope: this.scope(),
      Description: this.description(),
      IPAddressVersion: this.text("IPAddressVersion"),
      Addresses: this.requiredStrings("Addresses"),
    };
  }
}
