import type { SimWafActionInput } from "../../web-acl/sim-waf-action.type.js";
import type { SimWafAssociationConfigInput } from "../../web-acl/sim-waf-association-config.js";
import type { SimWafCustomResponseBodies } from "../../web-acl/sim-waf-custom-response.type.js";
import type { SimWafRuleInput } from "../../web-acl/sim-waf-rule.type.js";
import type { SimCreateWebAclCommandInput } from "../../command/web-acl/web-acl.command.js";
import { simWafUnsimulatedWebAclMembers } from "../../command/web-acl/sim-wafv2-unsimulated-web-acl-input.js";
import { SimCfnWafResourceConfig } from "../sim-cfn-waf-resource-config.js";
import { wafWebAclResourceType } from "../sim-cfn-waf-resource-types.js";

/**
 * Reads an AWS::WAFv2::WebACL Resource into what CreateWebACL takes.
 *
 * CloudFormation spells a web ACL the way the API spells it, so the rules, the
 * default action and the custom response bodies are handed over as the
 * template wrote them. They are not read here at all: every rule is compiled
 * by CreateWebACL, which is where a statement kind Yulin cannot evaluate is
 * found, and reading them twice would mean two answers to the same question.
 */
export class SimCfnWafWebAclConfig extends SimCfnWafResourceConfig {
  protected override get resourceType(): string {
    return wafWebAclResourceType;
  }

  /**
   * The input the web ACL this Resource describes is created from.
   *
   * The properties this simulation has no behaviour for are left out of it and
   * recorded, so the web ACL deploys with the rest of what the template wrote.
   * An SDK caller is refused for the same properties, because a request that
   * was answered and then quietly dropped is a worse answer than a refusal.
   */
  createInput(): SimCreateWebAclCommandInput {
    this.recordUnsimulatedMembers();

    return {
      Name: this.name(),
      Scope: this.scope(),
      Description: this.description(),
      DefaultAction: this.value("DefaultAction") as
        | SimWafActionInput
        | undefined,
      Rules: this.rules(),
      VisibilityConfig: this.value("VisibilityConfig"),
      CustomResponseBodies: this.value("CustomResponseBodies") as
        | SimWafCustomResponseBodies
        | undefined,
      AssociationConfig: this.value("AssociationConfig") as
        | SimWafAssociationConfigInput
        | undefined,
    };
  }

  /**
   * Record the web ACL members this simulation has no behaviour for.
   *
   * Each of them changes what a web ACL does on real WAF, so a web ACL
   * deployed without one behaves differently to the one the template
   * describes. `stack.ignoredProperties` is where a test reads that.
   */
  private recordUnsimulatedMembers(): void {
    for (const [member, reason] of simWafUnsimulatedWebAclMembers) {
      if (this.value(member) !== undefined) {
        this.resource.ignoreProperty(
          member,
          `${member} is not simulated: ${reason}`,
        );
      }
    }
  }

  /**
   * The rules the template declared.
   *
   * A web ACL with no `Rules` is one whose default action decides every
   * request, which is a template AWS accepts and a reasonable thing to deploy
   * before any rules are written.
   */
  private rules(): readonly SimWafRuleInput[] | undefined {
    const rules = this.value("Rules");

    if (rules === undefined) {
      return undefined;
    }

    if (!Array.isArray(rules)) {
      this.refuse("Rules must be a list");
    }

    return rules as readonly SimWafRuleInput[];
  }
}
