/**
 * One list member of a `Cors` block and the bounds Lambda puts on it.
 *
 * `AllowMethods` is capped at six characters. That is what leaves `OPTIONS`
 * out of the list a caller may state, since Lambda answers the preflight
 * itself.
 *
 * https://docs.aws.amazon.com/lambda/latest/api/API_Cors.html
 */
export interface CorsListConstraint {
  readonly member:
    | "AllowHeaders"
    | "AllowMethods"
    | "AllowOrigins"
    | "ExposeHeaders";
  readonly field: string;
  readonly maxItems: number;
  readonly minLength: number;
  readonly maxLength: number;
}

/**
 * The bounds Lambda publishes for each list member of a `Cors` block.
 */
export const corsListConstraints: readonly CorsListConstraint[] = [
  {
    member: "AllowHeaders",
    field: "cors.allowHeaders",
    maxItems: 100,
    minLength: 0,
    maxLength: 1024,
  },
  {
    member: "AllowMethods",
    field: "cors.allowMethods",
    maxItems: 6,
    minLength: 0,
    maxLength: 6,
  },
  {
    member: "AllowOrigins",
    field: "cors.allowOrigins",
    maxItems: 100,
    minLength: 1,
    maxLength: 253,
  },
  {
    member: "ExposeHeaders",
    field: "cors.exposeHeaders",
    maxItems: 100,
    minLength: 0,
    maxLength: 1024,
  },
];

/**
 * The bound a list broke, worded as Lambda words it, or nothing when the list
 * is within every bound.
 */
export function corsListViolation(
  values: readonly string[],
  constraint: CorsListConstraint,
): string | undefined {
  const { maxItems, minLength, maxLength } = constraint;

  if (values.length > maxItems) {
    return `Member must have length less than or equal to ${String(maxItems)}`;
  }

  const outOfRange = values.some(
    (value) => value.length < minLength || value.length > maxLength,
  );

  return outOfRange
    ? "Member must satisfy constraint: [Member must have length less than " +
        `or equal to ${String(maxLength)}, Member must have length greater ` +
        `than or equal to ${String(minLength)}]`
    : undefined;
}
