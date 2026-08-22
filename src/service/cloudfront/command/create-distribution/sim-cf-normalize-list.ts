import { isRecord } from "../../../../util/type-guard/record.js";
import { assertConsistentQuantity } from "../sim-cf-list-quantity.js";

/**
 * A CloudFront list, once normalized to the shape the simulator reads.
 */
export interface SimCloudFrontConfigList<T> {
  readonly Items?: readonly T[] | undefined;
}

/**
 * Normalize one of the list-like shapes a CloudFront config arrives in.
 *
 * The CloudFront API writes a list as `{ Quantity, Items }` and CloudFormation
 * writes the same list as a plain array. Both arrive here and leave as the
 * pair, so everything downstream reads one shape.
 */
export function normalizeSimCfList<T>(
  listName: string,
  value: unknown,
): SimCloudFrontConfigList<T> | undefined {
  if (value === undefined) {
    return undefined;
  }

  assertConsistentQuantity(listName, value);

  if (Array.isArray(value)) {
    return { Items: value as readonly T[] };
  }

  if (isRecord(value)) {
    return {
      ...value,
      // Keep downstream for..of iteration safe when Items is malformed.
      Items: Array.isArray(value["Items"])
        ? (value["Items"] as readonly T[])
        : undefined,
    };
  }

  /* v8 ignore next -- defensive fallback */
  return undefined;
}

/**
 * Normalize a list and every item in it.
 */
export function normalizeSimCfListItems<T>(
  listName: string,
  value: unknown,
  normalizeItem: (item: T) => T,
): SimCloudFrontConfigList<T> | undefined {
  const list = normalizeSimCfList<T>(listName, value);

  return list === undefined
    ? undefined
    : { ...list, Items: list.Items?.map(normalizeItem) };
}
