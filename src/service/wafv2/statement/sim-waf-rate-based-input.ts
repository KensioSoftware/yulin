import { simAwsProxiedSourceIp } from "../../../serve/http/sim-aws-proxied-connection.js";
import type { SimWafInspectedRequest } from "../evaluate/sim-waf-inspected-request.js";
import type { SimWafRateBasedStatementInput } from "./sim-waf-rate-based.type.js";
import type { SimWafStatementInput } from "./sim-waf-statement.type.js";
import { invalidSimWafRule } from "./sim-waf-rule-refusals.js";
import { refuseUnsimulatedSimWafRateKeyType } from "./sim-waf-unsimulated-rate-based.js";

/**
 * What a rule joining a rate limit to anything else is refused with.
 *
 * Real WAFv2 draws the line in both directions, and so does this. A
 * `RateBasedStatement` beside another kind would leave that kind unread and
 * the rate limit counting requests the rule meant to leave alone. Nesting one
 * inside a logical statement would count only the requests that reached it. A
 * rate limit narrows what it counts with its own `ScopeDownStatement`.
 */
export const simWafRateBasedIsWholeStatement =
  "A RateBasedStatement is the whole of a rule's statement, and cannot be " +
  "joined to or nested inside another one";

/**
 * Refuse a rule that names a rate limit and another statement kind together.
 */
export function refuseJoinedSimWafRateBased(
  statement: SimWafStatementInput,
  ruleName: string,
): void {
  if (statement.RateBasedStatement === undefined) {
    return;
  }

  const joined = Object.entries(statement).some(
    ([kind, value]) => kind !== "RateBasedStatement" && value !== undefined,
  );

  if (joined) {
    invalidSimWafRule(ruleName, simWafRateBasedIsWholeStatement);
  }
}

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

  refuseUnsimulatedSimWafRateKeyType(keyType, ruleName);

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
