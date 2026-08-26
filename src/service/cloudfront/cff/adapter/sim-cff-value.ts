import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";

/**
 * Present values in the shape CloudFront gives a repeated name.
 *
 * A single value is `value` alone. Repeated values keep the first in `value`
 * and all of them in `multiValue`. That is what a Function reads for a header
 * or a query parameter appearing more than once.
 */
export function toCffValue(
  values: readonly string[],
): CloudFrontFunction.Value | CloudFrontFunction.MultiValue | undefined {
  const [first] = values;
  if (first === undefined) {
    return undefined;
  }

  if (values.length === 1) {
    return { value: first };
  }

  return {
    value: first,
    multiValue: values.map((value) => ({ value })),
  };
}

/**
 * Read back the values a Function left under one name.
 *
 * A Function that means to send several values sets `multiValue`, and
 * CloudFront sends those in place of `value`.
 */
export function fromCffValue(
  valueOrMultiValue: CloudFrontFunction.Value | CloudFrontFunction.MultiValue,
): string[] {
  if ("multiValue" in valueOrMultiValue) {
    return valueOrMultiValue.multiValue.map(({ value }) => value);
  }

  return [valueOrMultiValue.value];
}
