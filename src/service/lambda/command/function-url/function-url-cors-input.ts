import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionUrlCors } from "../../function/url/sim-lambda-function-url-cors.js";
import {
  corsListConstraints,
  corsListViolation,
} from "./function-url-cors-constraints.js";

const maxAgeSeconds = 86_400;

/**
 * Validates the `Cors` block of Function URL config command input.
 *
 * Every check here is against a bound real Lambda publishes. A configuration
 * this accepts is one the API would have taken. Nothing else is checked,
 * because a refusal the real service would not make costs a working
 * deployment.
 *
 * The check runs before the Function URL is created or updated, leaving a
 * refused configuration with the URL as it was.
 */
export class FunctionUrlCorsInputParser {
  /**
   * Parse an optional `Cors` block, which every Function URL config command
   * allows a caller to leave out.
   */
  parseOptional(
    cors: SimLambdaFunctionUrlCors | undefined,
  ): SimLambdaFunctionUrlCors | undefined {
    if (cors === undefined) {
      return undefined;
    }

    for (const constraint of corsListConstraints) {
      const values = cors[constraint.member];

      if (values !== undefined) {
        this.refuse(
          `[${values.join(", ")}]`,
          constraint.field,
          corsListViolation(values, constraint),
        );
      }
    }

    this.checkMaxAge(cors.MaxAge);

    return cors;
  }

  private checkMaxAge(maxAge: number | undefined): void {
    if (maxAge === undefined) {
      return;
    }

    this.refuse(String(maxAge), "cors.maxAge", this.maxAgeViolation(maxAge));
  }

  private maxAgeViolation(maxAge: number): string | undefined {
    if (maxAge > maxAgeSeconds) {
      return `Member must have value less than or equal to ${String(maxAgeSeconds)}`;
    }

    return maxAge < 0
      ? "Member must have value greater than or equal to 0"
      : undefined;
  }

  /**
   * Fail the way Lambda fails a request that broke one bound.
   */
  private refuse(
    value: string,
    field: string,
    violation: string | undefined,
  ): void {
    if (violation === undefined) {
      return;
    }

    throw new SimLambdaValidationException(
      `1 validation error detected: Value '${value}' at '${field}' failed ` +
        `to satisfy constraint: ${violation}`,
    );
  }
}
