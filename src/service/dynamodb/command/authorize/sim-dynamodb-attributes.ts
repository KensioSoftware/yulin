import type { SimDynamoDbItem } from "../../item/sim-dynamodb-item.js";

/**
 * The condition key DynamoDB names a request's attributes by.
 */
export const simDynamoDbAttributesConditionKey = "dynamodb:Attributes";

/**
 * The top-level attribute names a `Key` or an `Item` carries.
 *
 * Those parameters name their attributes outright, so there is no expression
 * to read them out of. Every name is top-level, since an item's attributes are
 * what nesting starts from.
 *
 * The items are read when authorization asks for them, and whatever reading
 * them throws is dropped. Authorization runs ahead of the checks a command
 * makes on what it was given, so a request too malformed to read is authorized
 * naming no attributes and refused by the check that follows.
 */
export function simDynamoDbItemAttributeNames(
  items: () => readonly SimDynamoDbItem[],
): readonly string[] {
  try {
    return items().flatMap((item) => item.attributeNames());
  } catch {
    return [];
  }
}

/**
 * Gather the attribute names a request reaches, keeping each one once.
 *
 * A request names the same attribute in more than one place often enough for
 * this to matter. An UpdateItem names its key in `Key` and may name it again
 * in a condition, and AWS supplies one list of attributes rather than one per
 * parameter.
 */
export function simDynamoDbAttributesOf(
  ...sources: readonly (readonly string[])[]
): readonly string[] {
  return [...new Set(sources.flat())];
}
