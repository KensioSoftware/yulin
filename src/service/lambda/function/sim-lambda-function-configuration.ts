import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";

/**
 * The version qualifier every function answers to, which is the function
 * itself rather than any of the versions published from it.
 */
export const SIM_LAMBDA_LATEST_VERSION = "$LATEST";

export const DEFAULT_SIM_LAMBDA_TIMEOUT_SECONDS = 3;
export const DEFAULT_SIM_LAMBDA_MEMORY_SIZE_MB = 128;

export type SimLambdaFunctionState =
  | "Pending"
  | "Active"
  | "Inactive"
  | "Failed";

/**
 * Lambda function ARNs address the function with a colon, not a slash, and a
 * qualified one appends the version or alias with another colon.
 */
export type SimLambdaFunctionArn =
  `arn:aws:lambda:${string}:${string}:function:${string}`;

/**
 * Build the ARN a sim Lambda function has, or would have, in a scope.
 *
 * A qualifier is appended as real Lambda appends one, so a published version
 * and an alias are addressed by the ARN of the function they belong to with
 * their own name on the end. `$LATEST` is the function itself, so it is
 * addressed by an unqualified ARN.
 */
export function simLambdaFunctionArn(
  scope: SimAwsAccountRegionScope,
  name: string,
  qualifier?: string,
): SimLambdaFunctionArn {
  const qualifierSuffix =
    qualifier === undefined || qualifier === SIM_LAMBDA_LATEST_VERSION
      ? ""
      : `:${qualifier}`;

  return `arn:aws:lambda:${scope.regionName}:${scope.accountId}:function:${name}${qualifierSuffix}`;
}

/**
 * Minimal structural Lambda function configuration, as returned by
 * CreateFunction and GetFunction.
 */
export interface SimLambdaFunctionConfiguration {
  FunctionName: string;
  FunctionArn: SimLambdaFunctionArn;
  Role: string;
  State: SimLambdaFunctionState;
  Version: string;
  Timeout: number;
  MemorySize: number;
  Handler?: string | undefined;
  Runtime?: string | undefined;
  Description?: string | undefined;
  Environment?: { Variables: Record<string, string> } | undefined;
  DeadLetterConfig?: { TargetArn: string } | undefined;
}
