import { isRecord } from "../../../../util/type-guard/record.js";
import { assertConsistentQuantity } from "../sim-cf-list-quantity.js";

/**
 * A CloudFront list as the simulator holds it, whichever shape it arrived in.
 */
export interface SimCloudFrontConfigList<T> {
  readonly Items?: readonly T[] | undefined;
}

/**
 * Read one CloudFront list into the internal shape.
 *
 * CloudFormation and CDK emit a plain array for a list-like property, while an
 * SDK-style input carries `{ Quantity, Items }`. Both arrive here, and both
 * come out as something with `Items` on it. A `Quantity` that disagrees with
 * the items it counts is refused first.
 */
export function simCfNormalizedList<T>(
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
