import {
  SimLambdaInvalidParameterValueException,
  SimLambdaValidationException,
} from "../../error/sim-lambda.error.js";

/**
 * How many filters one mapping may carry. The default AWS quota is five, and
 * an Account can have it raised to ten. A simulation has no quota to read, so
 * it takes what the most generous Account could deploy, rather than refusing a
 * template that deploys for real.
 */
const filterLimit = 10;

/**
 * The longest pattern one filter may carry, in characters.
 */
const patternLengthLimit = 4096;

/**
 * Refuse a list of filters past the limits real Lambda puts on them: ten
 * filters to a mapping, and 4096 characters to a pattern.
 */
export function simLambdaAssertFilterLimits(
  filters: readonly { readonly Pattern?: string | undefined }[],
): void {
  if (filters.length > filterLimit) {
    throw new SimLambdaInvalidParameterValueException(
      `FilterCriteria carries ${String(filters.length)} filters, and an ` +
        `event source mapping takes at most ${String(filterLimit)}`,
    );
  }

  const tooLong = filters.findIndex(
    (filter) => (filter.Pattern?.length ?? 0) > patternLengthLimit,
  );

  if (tooLong !== -1) {
    throw new SimLambdaValidationException(
      `1 validation error detected: Value at 'filterCriteria.filters.${String(
        tooLong + 1,
      )}.member.pattern' failed to satisfy constraint: Member must have ` +
        `length less than or equal to ${String(patternLengthLimit)}`,
    );
  }
}
