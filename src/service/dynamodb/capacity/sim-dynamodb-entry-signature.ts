import { jsonStringify } from "../../../util/type-guard/json.js";
import { isRecord } from "../../../util/type-guard/record.js";
import type { SimDynamoDbItem } from "../item/sim-dynamodb-item.js";

/**
 * The set types, whose members DynamoDB holds in no order.
 */
const setTypes: ReadonlySet<string> = new Set(["SS", "NS", "BS"]);

/**
 * A stable string for an entry, or for the named attributes of it.
 *
 * Maps and sets are unordered in DynamoDB, so their members are sorted before
 * the entry is written out. Lists keep their order.
 */
export function simDynamoDbEntrySignature(
  entry: SimDynamoDbItem,
  names: readonly string[] = entry.attributeNames(),
): string {
  const named = Object.entries(entry.toAttributeValues()).filter(([name]) =>
    names.includes(name),
  );

  return jsonStringify(Object.fromEntries(named), canonical);
}

/**
 * Write maps with sorted keys and sets with sorted members.
 */
function canonical(key: string, value: unknown): unknown {
  if (Array.isArray(value) && setTypes.has(key)) {
    return value
      .map(String)
      .toSorted((left, right) => left.localeCompare(right));
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).toSorted(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}
