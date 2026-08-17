/**
 * The execution role credentials the Lambda runtime puts in the environment.
 *
 * Real Lambda sets these to the temporary credentials of the function's
 * execution Role, and an AWS SDK in the function code finds them there before
 * it looks anywhere else. Function code that bundles the SDK needs them for
 * the same reason: without them the first call fails while resolving
 * credentials, long before anything the simulation could answer.
 *
 * The values are placeholders, and deliberately say so. Nothing in the
 * simulation authorizes against them: a call from function code is attributed
 * to the execution Role because the invocation is running as it, which is what
 * the credentials would have identified anyway.
 */
export const simLambdaExecutionCredentials: readonly (readonly [
  string,
  string,
])[] = [
  ["AWS_ACCESS_KEY_ID", "ASIAYULINSIMULATED00"],
  ["AWS_SECRET_ACCESS_KEY", "yulinSimulatedSecretAccessKeyValue000000"],
  ["AWS_SESSION_TOKEN", "yulin-simulated-session-token"],
];
