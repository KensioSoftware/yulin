/**
 * Compare two runs of digits of the same length.
 */
function compareDigits(first: string, second: string): number {
  if (first < second) {
    return -1;
  }

  if (first > second) {
    return 1;
  }

  return 0;
}

/**
 * Compare the digits of two numbers, ignoring their signs.
 *
 * Both are in plain decimal notation with no leading zeros, so a longer whole
 * part is a bigger number and two whole parts of the same length compare
 * character by character. The fractions are then padded to the same length so
 * `0.5` and `0.45` compare by their digits rather than by how many there are.
 */
export function compareSimDynamoDbMagnitudes(
  first: string,
  second: string,
): number {
  const [firstWhole = "", firstFraction = ""] = first.split(".", 2);
  const [secondWhole = "", secondFraction = ""] = second.split(".", 2);

  if (firstWhole.length !== secondWhole.length) {
    return firstWhole.length - secondWhole.length;
  }

  if (firstWhole !== secondWhole) {
    return compareDigits(firstWhole, secondWhole);
  }

  const width = Math.max(firstFraction.length, secondFraction.length);

  return compareDigits(
    firstFraction.padEnd(width, "0"),
    secondFraction.padEnd(width, "0"),
  );
}
