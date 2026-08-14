import { simDynamoDbPlainDecimal } from "./sim-dynamodb-number-text.js";

/**
 * One number as whole digits and the power of ten they are scaled by.
 *
 * `12.34` is 1234 scaled by -2. Holding a number this way is what lets two of
 * them be added exactly: they are lined up on the same scale and added as whole
 * numbers, where converting them to JavaScript numbers would round both first.
 */
interface ScaledDigits {
  readonly digits: bigint;
  readonly scale: number;
}

/**
 * Read the plain decimal text a normalised number holds.
 */
function scaledDigitsOf(text: string): ScaledDigits {
  const [whole = "", fraction = ""] = text.split(".", 2);

  return { digits: BigInt(whole + fraction), scale: -fraction.length };
}

/**
 * The digits this number has when written at a scale it is no coarser than.
 */
function digitsAt(number: ScaledDigits, scale: number): bigint {
  return number.digits * 10n ** BigInt(number.scale - scale);
}

/**
 * Add one DynamoDB number to another, or take it away.
 *
 * The two are added as whole digits at their common scale, so nothing goes
 * through a JavaScript number on the way. Adding 1 to 9007199254740993 answers
 * 9007199254740994 here, where a double would answer 9007199254740992.
 *
 * The answer comes back as text, so whatever reads it applies the same range
 * and precision checks a number a request wrote goes through.
 */
export function sumSimDynamoDbNumberTexts(
  one: string,
  other: string,
  direction: 1 | -1,
): string {
  const augend = scaledDigitsOf(one);
  const addend = scaledDigitsOf(other);
  const scale = Math.min(augend.scale, addend.scale);
  const total =
    digitsAt(augend, scale) + BigInt(direction) * digitsAt(addend, scale);

  return simDynamoDbPlainDecimal(
    signOf(total),
    magnitudeOf(total).toString(),
    scale,
  );
}

/**
 * The sign a total is written with.
 */
function signOf(total: bigint): string {
  if (total < 0n) {
    return "-";
  }

  return "";
}

/**
 * A total without the sign in front of it.
 */
function magnitudeOf(total: bigint): bigint {
  if (total < 0n) {
    return -total;
  }

  return total;
}
