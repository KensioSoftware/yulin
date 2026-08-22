import { simLambdaExecutionCredentials } from "./sim-lambda-execution-credentials.js";

/**
 * The function details the AWS-provided runtime environment variables are
 * built from.
 */
export interface SimLambdaEnvironmentDetails {
  readonly functionName: string;
  readonly regionName: string;
  readonly memorySizeMb: number;
}

/**
 * The AWS-like standard runtime environment variables a function runs with.
 *
 * Real Lambda provides these to every invocation, whatever the function's
 * configuration declares, and an AWS SDK client built in the handler reads
 * its Region and its credentials from them.
 */
export function simLambdaRuntimeVariables(
  details: SimLambdaEnvironmentDetails,
): Record<string, string> {
  const { functionName, regionName, memorySizeMb } = details;

  // Built from entries rather than an object literal because AWS environment
  // variable names are not code identifier names, and the project's naming
  // rules treat object literal keys as if they were.
  return Object.fromEntries([
    ["AWS_REGION", regionName],
    ["AWS_DEFAULT_REGION", regionName],
    ["AWS_LAMBDA_FUNCTION_NAME", functionName],
    ["AWS_LAMBDA_FUNCTION_MEMORY_SIZE", String(memorySizeMb)],
    ["AWS_LAMBDA_FUNCTION_VERSION", "$LATEST"],
    ...simLambdaExecutionCredentials,
  ]);
}
