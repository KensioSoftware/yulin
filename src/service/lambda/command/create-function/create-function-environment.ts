import { SimLambdaInvalidParameterValueException } from "../../error/sim-lambda.error.js";
import type { SimLambdaFunctionEnvironment } from "./create-function.command.js";

/**
 * The environment variable names real Lambda reserves for the runtime, and
 * rejects at CreateFunction rather than letting function configuration
 * override.
 *
 * Keeping the same rule here means the AWS-provided runtime variables and the
 * declared ones can never collide, so neither needs to win over the other.
 */
const reservedVariableNames: ReadonlySet<string> = new Set([
  "_HANDLER",
  "_X_AMZN_TRACE_ID",
  "AWS_ACCESS_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_DEFAULT_REGION",
  "AWS_EXECUTION_ENV",
  "AWS_LAMBDA_FUNCTION_MEMORY_SIZE",
  "AWS_LAMBDA_FUNCTION_NAME",
  "AWS_LAMBDA_FUNCTION_VERSION",
  "AWS_LAMBDA_INITIALIZATION_TYPE",
  "AWS_LAMBDA_LOG_GROUP_NAME",
  "AWS_LAMBDA_LOG_STREAM_NAME",
  "AWS_LAMBDA_RUNTIME_API",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "LAMBDA_RUNTIME_DIR",
  "LAMBDA_TASK_ROOT",
]);

/**
 * Validate the Environment input into the variables declared for a function.
 */
export function requireLambdaEnvironmentVariables(
  environment: SimLambdaFunctionEnvironment | undefined,
): ReadonlyMap<string, string> {
  const variables = environment?.Variables;
  if (variables === undefined) {
    return new Map();
  }

  const declared = new Map(Object.entries(variables));
  requireNoReservedVariableNames(declared);

  return declared;
}

/**
 * Reject reserved variable names AWS-style, naming the offenders.
 */
function requireNoReservedVariableNames(
  declared: ReadonlyMap<string, string>,
): void {
  const reserved = declared
    .keys()
    .filter((name) => reservedVariableNames.has(name))
    .toArray()
    .toSorted((left, right) => left.localeCompare(right));

  if (reserved.length === 0) {
    return;
  }

  throw new SimLambdaInvalidParameterValueException(
    "Lambda was unable to configure your environment variables because " +
      "the environment variables you have provided contains reserved keys " +
      "that are currently not supported for modification. Reserved keys " +
      `used in this request: ${reserved.join(", ")}`,
  );
}
