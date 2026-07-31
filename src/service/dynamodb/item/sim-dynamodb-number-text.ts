/**
 * Render a number in plain decimal notation.
 *
 * Every number DynamoDB takes fits in plain notation: the widest is 126 digits
 * before the point and the smallest 130 zeros after it, so nothing here needs
 * an exponent to stay readable.
 *
 * Both the number a request wrote and the number arithmetic worked out are
 * written this way, so the same value reads back the same however it was
 * arrived at.
 */
export function simDynamoDbPlainDecimal(
  sign: string,
  digits: string,
  scale: number,
): string {
  if (scale >= 0) {
    return sign + digits + "0".repeat(scale);
  }

  const pointPosition = digits.length + scale;

  if (pointPosition > 0) {
    return `${sign + digits.slice(0, pointPosition)}.${digits.slice(pointPosition)}`;
  }

  return `${sign}0.${"0".repeat(-pointPosition)}${digits}`;
}
