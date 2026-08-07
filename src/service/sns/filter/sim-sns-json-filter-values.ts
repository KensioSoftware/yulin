import type { JSONValue } from "../../../util/type-guard/json.js";
import { SimSnsFilterValue } from "./sim-sns-filter-value.js";

/**
 * Read a piece of JSON as the values a filter policy can match against.
 *
 * A scalar is one value, a list is each of its members, and anything else is
 * nothing to match: an object is a level to go through rather than a value, and
 * a null holds nothing. A key holding null is therefore a key the policy finds
 * nothing at, which `{"exists": false}` matches.
 */
export function simSnsJsonFilterValues(
  json: JSONValue,
): readonly SimSnsFilterValue[] {
  if (typeof json === "string") {
    return [SimSnsFilterValue.ofText(json)];
  }

  if (typeof json === "number") {
    return [SimSnsFilterValue.ofNumber(json)];
  }

  if (typeof json === "boolean") {
    return [SimSnsFilterValue.ofBoolean(json)];
  }

  if (Array.isArray(json)) {
    return json.flatMap((member) => simSnsJsonFilterValues(member));
  }

  return [];
}
