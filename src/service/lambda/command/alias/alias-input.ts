import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";

const versionNumberPattern = /^\d+$/;

/**
 * Validates the version an alias command points an alias at.
 *
 * An alias names a published version, and only a published version. Real
 * Lambda refuses `$LATEST` here on the API-level pattern, before it looks for
 * anything of that name. The command types constrain this already, but
 * templates and plain JavaScript callers reach the same handlers, so the value
 * is checked at runtime and reported the way real Lambda reports it.
 */
export class AliasInputParser {
  /**
   * Parse a required FunctionVersion, as CreateAlias requires one.
   */
  requireFunctionVersion(value: string): string {
    if (!versionNumberPattern.test(value)) {
      throw new SimLambdaValidationException(
        `1 validation error detected: Value '${value}' at 'functionVersion' failed to satisfy constraint: Member must satisfy regular expression pattern: [0-9]+`,
      );
    }

    return value;
  }

  /**
   * Parse an optional FunctionVersion, as UpdateAlias allows omitting it to
   * leave the alias pointing where it points.
   */
  parseOptionalFunctionVersion(value: string | undefined): string | undefined {
    return value === undefined ? undefined : this.requireFunctionVersion(value);
  }
}
