import { isRecord } from "../../../util/type-guard/record.js";
import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { SimSnsInvalidParameterException } from "../error/sim-sns.error.js";

/**
 * Refuse a filter policy real SNS would refuse.
 *
 * Every refusal here happens when the policy is set rather than when a message
 * is matched, because a policy accepted and then never matching looks exactly
 * like correct filtering.
 */
export function simSnsFilterPolicyRefusal(
  reason: string,
): SimSnsInvalidParameterException {
  return new SimSnsInvalidParameterException(
    `Invalid parameter: FilterPolicy: ${reason}`,
  );
}

/**
 * Read an operator's operand as the text it has to be.
 */
export function filterPolicyText(operand: JSONValue, operator: string): string {
  if (typeof operand !== "string") {
    throw simSnsFilterPolicyRefusal(
      `${operator} takes a string, and this one takes ${JSON.stringify(
        operand,
      )}`,
    );
  }

  return operand;
}

/**
 * Read an operator's operand as the list it has to be.
 */
export function filterPolicyList(
  operand: JSONValue,
  operator: string,
): readonly JSONValue[] {
  if (!Array.isArray(operand)) {
    throw simSnsFilterPolicyRefusal(
      `${operator} takes a list, and this one takes ${JSON.stringify(operand)}`,
    );
  }

  return operand;
}

/**
 * One operator of a match condition, and what it was written against.
 */
export interface SimSnsFilterOperator {
  readonly name: string;
  readonly operand: JSONValue;
}

/**
 * Read a policy value as the object of one operator it has to be.
 *
 * Real SNS takes one operator per match condition. Two in one object would be
 * two rules with no stated relationship between them, so it is refused rather
 * than resolved by picking the first.
 */
export function filterPolicyOperator(value: JSONObject): SimSnsFilterOperator {
  const entries = Object.entries(value);
  const [entry] = entries;

  if (entries.length !== 1 || entry === undefined) {
    throw simSnsFilterPolicyRefusal(
      `a match condition names one operator, and this one names ` +
        `${String(entries.length)}: ${JSON.stringify(value)}`,
    );
  }

  return { name: entry[0], operand: entry[1] };
}

/**
 * Whether a policy value is an object rather than a list or a scalar.
 */
export function isFilterPolicyObject(value: JSONValue): value is JSONObject {
  return isRecord(value);
}
