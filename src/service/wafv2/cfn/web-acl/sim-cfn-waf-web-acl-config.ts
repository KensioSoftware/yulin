import type { SimWafActionInput } from "../../web-acl/sim-waf-action.type.js";
import type { SimWafAssociationConfigInput } from "../../web-acl/sim-waf-association-config.js";
import type { SimWafCustomResponseBodies } from "../../web-acl/sim-waf-custom-response.type.js";
import type { SimWafRuleInput } from "../../web-acl/sim-waf-rule.type.js";
import type { SimCreateWebAclCommandInput } from "../../command/web-acl/web-acl.command.js";
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
 * The members Yulin holds without acting on are handed over the same way.
 */
export class SimCfnWafWebAclConfig extends SimCfnWafResourceConfig {
  protected override get resourceType(): string {
    return wafWebAclResourceType;
  }

  /**
   * The input the web ACL this Resource describes is created from.
   */
  createInput(): SimCreateWebAclCommandInput {
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
      CaptchaConfig: this.value("CaptchaConfig"),
      ChallengeConfig: this.value("ChallengeConfig"),
      TokenDomains: this.value("TokenDomains") as readonly string[] | undefined,
      DataProtectionConfig: this.value("DataProtectionConfig"),
      OnSourceDDoSProtectionConfig: this.value("OnSourceDDoSProtectionConfig"),
      ApplicationConfig: this.value("ApplicationConfig"),
    };
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
