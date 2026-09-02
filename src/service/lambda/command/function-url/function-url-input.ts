import { SimLambdaValidationException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionUrlCors } from "../../function/url/sim-lambda-function-url-cors.js";
import type {
  SimLambdaFunctionUrlAuthType,
  SimLambdaFunctionUrlInvokeMode,
} from "../../function/url/sim-lambda-function-url.js";
import { FunctionUrlCorsInputParser } from "./function-url-cors-input.js";

const authTypes: readonly string[] = ["NONE", "AWS_IAM"];
const invokeModes: readonly string[] = ["BUFFERED", "RESPONSE_STREAM"];

/**
 * Validates the enumerated values in Function URL config command input.
 *
 * The command types constrain these already, but templates and plain
 * JavaScript callers reach the same handlers, so the values are checked at
 * runtime and reported the way real Lambda reports a bad enum member.
 */
export class FunctionUrlInputParser {
  private readonly corsParser = new FunctionUrlCorsInputParser();

  /**
   * Parse a required AuthType, as CreateFunctionUrlConfig requires one.
   */
  requireAuthType(value: string | undefined): SimLambdaFunctionUrlAuthType {
    if (value === undefined) {
      throw new SimLambdaValidationException(
        "1 validation error detected: Value null at 'authType' failed to satisfy constraint: Member must not be null",
      );
    }

    return this.parseAuthType(value);
  }

  /**
   * Parse an optional AuthType, as UpdateFunctionUrlConfig allows omitting it.
   */
  parseOptionalAuthType(
    value: string | undefined,
  ): SimLambdaFunctionUrlAuthType | undefined {
    if (value === undefined) {
      return undefined;
    }

    return this.parseAuthType(value);
  }

  /**
   * Parse an optional InvokeMode, which defaults to BUFFERED on real Lambda.
   */
  parseOptionalInvokeMode(
    value: string | undefined,
  ): SimLambdaFunctionUrlInvokeMode | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (!invokeModes.includes(value)) {
      throw new SimLambdaValidationException(
        `1 validation error detected: Value '${value}' at 'invokeMode' failed to satisfy constraint: Member must satisfy enum value set: [${invokeModes.join(", ")}]`,
      );
    }

    return value as SimLambdaFunctionUrlInvokeMode;
  }

  /**
   * Parse an optional `Cors` block, which every Function URL config command
   * allows a caller to leave out.
   */
  parseOptionalCors(
    value: SimLambdaFunctionUrlCors | undefined,
  ): SimLambdaFunctionUrlCors | undefined {
    return this.corsParser.parseOptional(value);
  }

  private parseAuthType(value: string): SimLambdaFunctionUrlAuthType {
    if (!authTypes.includes(value)) {
      throw new SimLambdaValidationException(
        `1 validation error detected: Value '${value}' at 'authType' failed to satisfy constraint: Member must satisfy enum value set: [${authTypes.join(", ")}]`,
      );
    }

    return value as SimLambdaFunctionUrlAuthType;
  }
}
