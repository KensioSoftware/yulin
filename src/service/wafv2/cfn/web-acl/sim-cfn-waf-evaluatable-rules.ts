import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCreateWebAclCommandInput } from "../../command/web-acl/web-acl.command.js";
import type { SimWafV2 } from "../../sim-wafv2.js";
import type { SimWafRuleInput } from "../../web-acl/sim-waf-rule.type.js";

/**
 * The rules of a template web ACL to deploy, which are the ones this
 * simulation can evaluate.
 *
 * Each rule left out is recorded on the Resource under its own name, because a
 * web ACL is a list of rules that all look alike from the outside and the name
 * is the only thing that says which one went missing. The reason is the one
 * `CreateWebACL` refuses the rule with, so a reader gets the same sentence
 * wherever they meet it.
 */
export function simCfnWafEvaluatableRules(
  wafV2: SimWafV2,
  resource: SimCfnResource,
  input: SimCreateWebAclCommandInput,
): readonly SimWafRuleInput[] | undefined {
  const unevaluatable = wafV2.unevaluatableWebAclRules(input);

  if (unevaluatable.length === 0) {
    return input.Rules;
  }

  const dropped = new Set(unevaluatable.map(({ index }) => index));

  for (const rule of unevaluatable) {
    resource.ignoreProperty(`Rules.${rule.name}`, rule.reason);
  }

  return input.Rules?.filter((_, index) => !dropped.has(index));
}
