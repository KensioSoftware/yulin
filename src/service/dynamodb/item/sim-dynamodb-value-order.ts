import type { SimDynamoDbValue } from "./sim-dynamodb-value.js";

/**
 * Compare two runs of bytes as unsigned, which is how DynamoDB orders binary.
 *
 * The shorter of two values that agree as far as it goes comes first, so
 * `[1, 2]` sorts before `[1, 2, 0]`.
 */
export function compareSimDynamoDbBytes(
  first: Uint8Array,
  second: Uint8Array,
): number {
  return Buffer.compare(first, second);
}

/**
 * Compare two strings by their UTF-8 bytes, which is how DynamoDB orders them.
 *
 * JavaScript compares strings by UTF-16 code units, which puts characters above
 * the basic plane before ones like `U+FFFD` rather than after them. The strings
 * are encoded first so the order is DynamoDB's rather than the language's.
 */
function compareTexts(first: string, second: string): number {
  return compareSimDynamoDbBytes(
    Buffer.from(first, "utf8"),
    Buffer.from(second, "utf8"),
  );
}

/**
 * Whether an ordering satisfies one of the four ordering comparators.
 *
 * Only those four reach here: `=` and `<>` are answered by equality rather than
 * by an order, so the last of the four is the remaining case. Condition
 * expressions and key conditions both read a comparator this way, which is why
 * it sits with the item model.
 */
export function simDynamoDbOrderHolds(
  comparator: string,
  order: number,
): boolean {
  switch (comparator) {
    case "<": {
      return order < 0;
    }
    case "<=": {
      return order <= 0;
    }
    case ">": {
      return order > 0;
    }
    default: {
      return order >= 0;
    }
  }
}

/**
 * Order two stored values, or nothing when they cannot be ordered.
 *
 * DynamoDB orders strings, numbers and binary, and only against a value of the
 * same type. Anything else has no order, which is what makes a `<` between two
 * different types false rather than an error.
 */
export function compareSimDynamoDbValues(
  first: SimDynamoDbValue,
  second: SimDynamoDbValue,
): number | undefined {
  if (first.kind === "S" && second.kind === "S") {
    return compareTexts(first.text, second.text);
  }

  if (first.kind === "N" && second.kind === "N") {
    return first.number.compareTo(second.number);
  }

  if (first.kind === "B" && second.kind === "B") {
    return compareSimDynamoDbBytes(first.bytes, second.bytes);
  }

  return undefined;
}
