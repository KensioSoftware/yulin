import type { JSONObject, JSONValue } from "../../../util/type-guard/json.js";
import { simSnsFilterReservedNames } from "./sim-sns-filter-operators.js";
import {
  filterPolicyList,
  isFilterPolicyObject,
  simSnsFilterPolicyRefusal,
} from "./sim-sns-filter-refusals.js";

/**
 * The key real SNS reads as an OR across separate keys.
 */
export const simSnsOrKey = "$or";

/**
 * Refuse an alternative real SNS would not read as one.
 *
 * Real SNS asks that no field name inside an `$or` be a reserved keyword, which
 * is what the operators are named. A policy breaking that rule is not an error
 * there: `$or` becomes an ordinary attribute name, so the policy asks about an
 * attribute called `$or` and matches nothing. It is refused here instead,
 * because a policy that quietly stopped being an or is the failure this feature
 * exists to prevent.
 */
function assertAlternative(written: JSONValue): JSONObject {
  if (!isFilterPolicyObject(written)) {
    throw simSnsFilterPolicyRefusal(
      `each alternative of ${simSnsOrKey} is a policy of its own, and this one ` +
        `is ${JSON.stringify(written)}`,
    );
  }

  const reserved = Object.keys(written).find((name) =>
    simSnsFilterReservedNames.has(name),
  );

  if (reserved !== undefined) {
    throw simSnsFilterPolicyRefusal(
      `an alternative of ${simSnsOrKey} names keys of the message, and this ` +
        `one names the reserved ${reserved}, which real SNS reads as an ` +
        `attribute called ${simSnsOrKey} rather than as an or`,
    );
  }

  return written;
}

/**
 * Read the alternatives of an `$or`, refusing what real SNS would not read as
 * one.
 *
 * Real SNS recognises an `$or` only when it holds an array of at least two
 * objects, none of which names a reserved keyword. Anything else is an ordinary
 * attribute name there rather than an error, which makes a policy that looks
 * like an or and is not one: it asks about an attribute called `$or`, so it
 * matches nothing. Each of those is refused here when the policy is set.
 */
export function simSnsOrAlternatives(
  written: JSONValue,
): readonly JSONObject[] {
  const alternatives = filterPolicyList(written, simSnsOrKey);

  if (alternatives.length < 2) {
    throw simSnsFilterPolicyRefusal(
      `${simSnsOrKey} holds at least two alternatives, and this one holds ${String(
        alternatives.length,
      )}`,
    );
  }

  return alternatives.map((alternative) => assertAlternative(alternative));
}
