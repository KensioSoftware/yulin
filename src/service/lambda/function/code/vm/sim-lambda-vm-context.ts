import vm from "node:vm";

/**
 * The AWS-like execution environment details exposed to sim Lambda function
 * code running in a vm context.
 */
export interface SimLambdaVmEnvironment {
  readonly functionName: string;
  readonly regionName: string;
  readonly memorySizeMb: number;
}

/**
 * Build the AWS-like standard runtime environment variables.
 */
function runtimeEnvironmentVariables(
  environment: SimLambdaVmEnvironment,
): Record<string, string> {
  return Object.fromEntries([
    ["AWS_REGION", environment.regionName],
    ["AWS_DEFAULT_REGION", environment.regionName],
    ["AWS_LAMBDA_FUNCTION_NAME", environment.functionName],
    ["AWS_LAMBDA_FUNCTION_MEMORY_SIZE", String(environment.memorySizeMb)],
    ["AWS_LAMBDA_FUNCTION_VERSION", "$LATEST"],
  ]);
}

/**
 * Create the sandbox vm context that sim Lambda function code runs in.
 *
 * The context provides the common globals a Node.js Lambda runtime offers,
 * including an AWS-like process.env with the standard runtime variables.
 * Everything else must be part of the deployed function code archive, as on
 * real Lambda.
 */
export function makeSimLambdaVmContext(
  environment: SimLambdaVmEnvironment,
): vm.Context {
  return vm.createContext({
    console,
    Buffer,
    process: {
      env: runtimeEnvironmentVariables(environment),
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    queueMicrotask,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    structuredClone,
    crypto,
  });
}
