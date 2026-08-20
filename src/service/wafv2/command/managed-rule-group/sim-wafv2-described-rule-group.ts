import { SimWafUnsimulatedInputException } from "../../error/sim-wafv2.error.js";
import {
  findSimWafManagedRuleGroup,
  simWafManagedRuleGroupNames,
} from "../../managed/sim-waf-managed-rule-groups.js";
import type { SimWafManagedRuleGroupDefinition } from "../../managed/sim-waf-managed-rule.type.js";

/**
 * Find the group a description names, refusing one that is not simulated.
 */
export function requiredSimWafDescribedGroup(
  vendorName: string | undefined,
  name: string | undefined,
): SimWafManagedRuleGroupDefinition {
  const group = findSimWafManagedRuleGroup(vendorName, name);

  if (group === undefined) {
    const simulated = simWafManagedRuleGroupNames().join(", ");

    throw new SimWafUnsimulatedInputException(
      `The managed rule group ${String(vendorName)} ${String(name)} is not ` +
        `simulated: the simulated groups are ${simulated}`,
    );
  }

  return group;
}

/**
 * Refuse a description of a published version of a group.
 *
 * A version is a snapshot of the rules as they stood on a date, and only the
 * current rules are carried here, so a version name would be answered with
 * rules that are not the ones it names.
 */
export function refuseSimWafManagedRuleGroupVersion(
  versionName: string | undefined,
): void {
  if (versionName !== undefined) {
    throw new SimWafUnsimulatedInputException(
      "DescribeManagedRuleGroup refuses a VersionName, which Yulin does not " +
        "simulate: a versioned rule group is a snapshot of rules that were " +
        "published on a date, and only the current rules are carried here",
    );
  }
}
