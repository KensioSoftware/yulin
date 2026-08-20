import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import { requiredSimWafScope } from "../../scope/sim-waf-scope.js";
import type { SimWafAuthorizer } from "../authorize/sim-wafv2-authorizer.js";
import type { SimWafRequestOptions } from "../sim-wafv2-request-options.js";
import type {
  SimDescribeManagedRuleGroupCommand,
  SimDescribeManagedRuleGroupCommandOutput,
} from "./managed-rule-group.command.js";
import {
  refuseSimWafManagedRuleGroupVersion,
  requiredSimWafDescribedGroup,
} from "./sim-wafv2-described-rule-group.js";

interface SimWafManagedRuleGroupCommandsProperties {
  readonly authorizer: SimWafAuthorizer;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * The command that reports what is in a managed rule group.
 *
 * This is how a caller finds out which rules a group holds and what to name in
 * a `RuleActionOverrides`, and it is the only WAFv2 operation the AWS managed
 * groups have of their own. Real WAFv2 gives it no resource type, so it
 * authorizes against `*` as the listings do.
 */
export class SimWafManagedRuleGroupCommands {
  readonly #authorizer: SimWafAuthorizer;
  readonly #accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimWafManagedRuleGroupCommandsProperties) {
    this.#authorizer = properties.authorizer;
    this.#accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Describe the rules and labels of one managed rule group.
   */
  describeManagedRuleGroup(
    command: SimDescribeManagedRuleGroupCommand,
    options?: SimWafRequestOptions,
  ): SimDescribeManagedRuleGroupCommandOutput {
    const { input } = command;

    requiredSimWafScope(input.Scope, this.#accountRegionScope.regionName);
    refuseSimWafManagedRuleGroupVersion(input.VersionName);

    this.#authorizer.authorizeNoResource(
      "wafv2:DescribeManagedRuleGroup",
      options?.caller,
    );

    const group = requiredSimWafDescribedGroup(input.VendorName, input.Name);

    return {
      $metadata: {},
      Capacity: group.capacity,
      LabelNamespace: `${group.labelNamespace}:`,
      Rules: group.rules.map((rule) => ({
        Name: rule.name,
        Action: { Block: {} },
      })),
      AvailableLabels: group.rules.map((rule) => ({
        Name: `${group.labelNamespace}:${rule.label}`,
      })),
    };
  }
}
