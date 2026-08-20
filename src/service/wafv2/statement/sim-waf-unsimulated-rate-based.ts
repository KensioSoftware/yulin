import type { SimWafRateBasedStatementInput } from "./sim-waf-rate-based.type.js";
import { refuseSimWafRuleInput } from "./sim-waf-rule-refusals.js";

const forwardedAddress =
  "it reads the address from a forwarding header, and needs the source " +
  "address variety IPSetReferenceStatement is waiting on";

const customAggregation =
  "aggregating on headers, cookies and query arguments is feasible and is " +
  "not part of this";

/**
 * The aggregation key types real WAFv2 has and this simulation does not.
 */
const refusedKeyTypes = new Map<string, string>([
  ["FORWARDED_IP", forwardedAddress],
  ["CUSTOM_KEYS", customAggregation],
]);

/**
 * The rate-based members real WAFv2 takes and this simulation does not.
 */
const refusedMembers = new Map<string, string>([
  ["CustomKeys", customAggregation],
  ["ForwardedIPConfig", forwardedAddress],
]);

/**
 * Refuse the parts of a rate-based statement this simulation cannot evaluate.
 */
export function refuseUnsimulatedSimWafRateMembers(
  statement: SimWafRateBasedStatementInput,
  ruleName: string,
): void {
  for (const [member, value] of Object.entries(statement)) {
    const reason = refusedMembers.get(member);

    if (reason !== undefined && value !== undefined) {
      refuseSimWafRuleInput(ruleName, `RateBasedStatement ${member}`, reason);
    }
  }
}

/**
 * Refuse an aggregation key type this simulation cannot count by.
 */
export function refuseUnsimulatedSimWafRateKeyType(
  keyType: string | undefined,
  ruleName: string,
): void {
  const reason = refusedKeyTypes.get(keyType ?? "");

  if (reason !== undefined) {
    refuseSimWafRuleInput(
      ruleName,
      `the aggregation key type ${keyType}`,
      reason,
    );
  }
}
