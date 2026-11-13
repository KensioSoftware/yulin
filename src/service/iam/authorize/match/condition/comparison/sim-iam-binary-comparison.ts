import type {
  SimIamScalarConditionValue,
  SimIamValueComparison,
} from "./sim-iam-value-comparison.js";

/**
 * Read one value as the bytes its base64 text encodes.
 *
 * Node.js decodes base64 leniently and skips what it cannot read. Encoding the
 * bytes again and comparing with the original refuses text that is not
 * padded base64.
 */
function bytesOf(value: SimIamScalarConditionValue): Buffer | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const bytes = Buffer.from(value, "base64");

  return bytes.toString("base64") === value ? bytes : undefined;
}

/**
 * The comparison `BinaryEquals` is built from.
 *
 * AWS compares the request value byte for byte with the binary value the
 * policy writes as base64. The request value arrives as base64 too.
 */
export const simIamBinaryComparison: SimIamValueComparison = (
  actual,
  expected,
) => {
  const requested = bytesOf(actual);
  const written = bytesOf(expected);

  if (requested === undefined || written === undefined) {
    return;
  }

  return requested.equals(written);
};
