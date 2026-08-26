/**
 * A number written out, kept as the digits it was written with.
 *
 * Reading one through `Number` loses whatever will not fit in a double, so
 * `9007199254740993` becomes `9007199254740992` and compares equal to it. A
 * partition key declared `bigint` can hold either, and a catalog answering
 * that they are the same partition is wrong in a way a test would trust.
 */
export interface SimGlueDecimal {
  readonly negative: boolean;
  readonly whole: string;
  readonly fraction: string;
}

/** Read a number written out, or nothing where the text is not one. */
export function simGlueDecimal(text: string): SimGlueDecimal | undefined {
  const trimmed = text.trim();
  const negative = trimmed.startsWith("-");
  const digits = negative ? trimmed.slice(1) : trimmed;
  const point = digits.indexOf(".");
  const whole = point === -1 ? digits : digits.slice(0, point);
  const fraction = point === -1 ? "" : digits.slice(point + 1);

  if (!isDigits(whole) || (point !== -1 && !isDigits(fraction))) {
    return undefined;
  }

  return { negative, whole, fraction };
}

/**
 * How two numbers sit against each other, exactly.
 *
 * Negative, zero or positive, the way a sort comparator reports it. Zero has
 * no sign here, so `-0` and `0` are the same number.
 */
export function simGlueCompareDecimals(
  left: SimGlueDecimal,
  right: SimGlueDecimal,
): number {
  const magnitude = compareMagnitudes(left, right);

  if (magnitude === 0 && isZero(left)) {
    return 0;
  }

  if (left.negative !== right.negative) {
    return left.negative ? -1 : 1;
  }

  return left.negative ? -magnitude : magnitude;
}

/** How two numbers sit against each other with their signs set aside. */
function compareMagnitudes(
  left: SimGlueDecimal,
  right: SimGlueDecimal,
): number {
  const whole = compareDigits(
    stripLeadingZeros(left.whole),
    stripLeadingZeros(right.whole),
  );

  if (whole !== 0) {
    return whole;
  }

  const width = Math.max(left.fraction.length, right.fraction.length);

  return compareDigits(
    left.fraction.padEnd(width, "0"),
    right.fraction.padEnd(width, "0"),
  );
}

/**
 * Two runs of digits compared as numbers.
 *
 * The longer run is the larger number once leading zeros are gone, and two of
 * the same length compare character by character.
 */
function compareDigits(left: string, right: string): number {
  if (left.length !== right.length) {
    return left.length - right.length;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function stripLeadingZeros(digits: string): string {
  return digits.replace(/^0+(?=.)/, "");
}

function isZero(value: SimGlueDecimal): boolean {
  return !/[1-9]/.test(value.whole + value.fraction);
}

function isDigits(text: string): boolean {
  return text.length > 0 && !/\D/.test(text);
}
