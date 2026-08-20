import { simAwsProxiedSourceIp } from "../../../serve/http/sim-aws-proxied-connection.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafRateBasedStatementInput } from "./sim-waf-rate-based.type.js";
import {
  invalidSimWafRule,
  refuseSimWafRuleInput,
} from "./sim-waf-rule-refusals.js";

/**
 * Which aggregation instance one request is counted under.
 */
export type SimWafRateAggregation = (request: SimWafInspectedRequest) => string;

/** The windows AWS counts over, in seconds. */
const evaluationWindows = new Set([60, 120, 300, 600]);

/** What AWS counts over when a statement names no window. */
const defaultEvaluationWindowSec = 300;

const millisecondsPerSecond = 1000;

/** The smallest and largest limits AWS takes. */
const smallestLimit = 10;
const largestLimit = 2_000_000_000;

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
 * Read how many requests a rate-based statement counts up to.
 *
 * AWS holds the limit to at least ten. A rule below that would limit a client
 * that had barely arrived.
 */
export function simWafRateLimit(
  statement: SimWafRateBasedStatementInput,
  ruleName: string,
): number {
  const limit = statement.Limit;

  if (limit === undefined || !Number.isSafeInteger(limit)) {
    invalidSimWafRule(ruleName, "A RateBasedStatement needs a whole Limit");
  }

  if (limit < smallestLimit || limit > largestLimit) {
    invalidSimWafRule(
      ruleName,
      `A RateBasedStatement Limit is between ${smallestLimit} and ` +
        `${largestLimit}, and this one is ${limit}`,
    );
  }

  return limit;
}

/**
 * Read how long a rate-based statement counts over, in milliseconds.
 *
 * AWS takes four windows and no others, and a statement naming none counts
 * over five minutes.
 */
export function simWafRateWindowMilliseconds(
  statement: SimWafRateBasedStatementInput,
  ruleName: string,
): number {
  const seconds = statement.EvaluationWindowSec ?? defaultEvaluationWindowSec;

  if (!evaluationWindows.has(seconds)) {
    invalidSimWafRule(
      ruleName,
      `A RateBasedStatement EvaluationWindowSec is one of ` +
        `${[...evaluationWindows].join(", ")}, and this one is ${seconds}`,
    );
  }

  return seconds * millisecondsPerSecond;
}

/**
 * Read how a rate-based statement groups the requests it counts.
 *
 * `IP` counts each client address on its own. Every request in this simulation
 * reports `simAwsProxiedSourceIp`, leaving one client for the whole
 * simulation. A rate limiting test sends its requests from one client and
 * expects the rule to trip, so that is the case anybody would write.
 *
 * `CONSTANT` counts every request the statement sees together, and AWS asks
 * for a scope-down statement alongside it to say which requests those are. A
 * rule without one would limit everything the web ACL serves.
 */
export function simWafRateAggregation(
  statement: SimWafRateBasedStatementInput,
  ruleName: string,
): SimWafRateAggregation {
  const keyType = statement.AggregateKeyType;
  const refused = refusedKeyTypes.get(keyType ?? "");

  if (refused !== undefined) {
    refuseSimWafRuleInput(
      ruleName,
      `the aggregation key type ${keyType}`,
      refused,
    );
  }

  if (keyType === "IP") {
    return (): string => simAwsProxiedSourceIp;
  }

  if (keyType === "CONSTANT") {
    if (statement.ScopeDownStatement === undefined) {
      invalidSimWafRule(
        ruleName,
        "A RateBasedStatement aggregating on CONSTANT needs a " +
          "ScopeDownStatement to say which requests it counts",
      );
    }

    return (): string => "CONSTANT";
  }

  invalidSimWafRule(
    ruleName,
    `A RateBasedStatement AggregateKeyType is IP or CONSTANT, and this one ` +
      `is ${String(keyType)}`,
  );
}
