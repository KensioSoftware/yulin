import { SimIamValidationError } from "../../error/sim-iam.error.js";
import { normaliseUserPath } from "../../user/sim-iam-user-path.js";

/**
 * A path a command gives, normalised to begin and end with `/`, refusing one
 * IAM refuses: longer than 512 characters, or holding a character outside
 * printable ASCII.
 */
export function simIamValidPath(
  path: string | undefined,
  member: string,
): string {
  const normalised = normaliseUserPath(path);

  if (normalised.length > 512) {
    throw SimIamValidationError.member(
      member,
      normalised,
      "have length less than or equal to 512",
    );
  }

  // The path already begins and ends with `/`, so what is left to test is
  // that every character is printable ASCII.
  if (!/^[!-~]+$/u.test(normalised)) {
    throw SimIamValidationError.member(
      member,
      normalised,
      String.raw`satisfy regular expression pattern: (\u002F)|(\u002F[\u0021-\u007E]+\u002F)`,
    );
  }

  return normalised;
}
