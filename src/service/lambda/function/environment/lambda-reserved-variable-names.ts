/**
 * The environment variable names real Lambda reserves for the runtime, and
 * rejects at CreateFunction rather than letting function configuration
 * override.
 *
 * Keeping the same rule here means the AWS-provided runtime variables and the
 * declared ones can never collide, so neither needs to win over the other.
 *
 * Note that the two names starting with an underscore cannot match the AWS
 * environment variable name pattern either, so in practice they are reported
 * as an invalid name rather than a reserved one, as on real AWS.
 */
export const lambdaReservedVariableNames: ReadonlySet<string> = new Set([
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
  "AWS_LAMBDA_MAX_CONCURRENCY",
  "AWS_LAMBDA_METADATA_API",
  "AWS_LAMBDA_METADATA_TOKEN",
  "AWS_LAMBDA_RUNTIME_API",
  "AWS_REGION",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "LAMBDA_RUNTIME_DIR",
  "LAMBDA_TASK_ROOT",
]);
