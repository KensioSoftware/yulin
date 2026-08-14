import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimEventBusName } from "../bus/sim-event-bus-name.js";

/**
 * The ARN of one rule, which names the bus it is on unless that is the default
 * one.
 *
 * A rule on the default bus is `rule/<name>`, and a rule on a custom bus is
 * `rule/<bus>/<name>`. That is what keeps two rules of the same name on two
 * buses apart, and it is why a rule ARN can carry one more `/` than an event
 * bus ARN does.
 *
 * Both the rule itself and the authorization of a request that names one build
 * their ARN here, since a request has to authorize against the ARN a rule
 * would have before knowing whether that rule exists.
 */
export function eventRuleArn(
  ruleName: string,
  busName: SimEventBusName,
  scope: SimAwsAccountRegionScope,
): string {
  const prefix = `arn:aws:events:${scope.regionName}:${scope.accountId}:rule/`;

  if (busName.isDefault) {
    return prefix + ruleName;
  }

  return `${prefix}${busName.value}/${ruleName}`;
}
