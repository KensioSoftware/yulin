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

/**
 * The host environment variable names that point an AWS SDK at credentials
 * outside the invocation.
 *
 * A function declaring no variables of its own runs with the host process
 * environment underneath the AWS-provided ones, which is where an in-process
 * handler reads its configuration from. These names are not that
 * configuration. They are how a developer's shell and a CI runner select the
 * AWS access they hold themselves, and real Lambda sets none of them.
 *
 * `AWS_PROFILE` is the one that stops an invocation outright. The Node.js
 * credential provider chain skips its environment-variable provider whenever
 * that name is set, reporting "AWS_PROFILE is set, skipping fromEnv
 * provider.", and the placeholder credentials above go unread. Resolution
 * leaves the simulation for a shared configuration file or an SSO portal, and
 * the client throws while resolving, before the request it was building
 * reaches a simulated service. The rest each name a credential source of their
 * own and are masked for the same reason.
 */
export const hostAwsCredentialVariableNames: ReadonlySet<string> = new Set([
  "AWS_CONTAINER_AUTHORIZATION_TOKEN",
  "AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE",
  "AWS_CONTAINER_CREDENTIALS_FULL_URI",
  "AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
  "AWS_CONFIG_FILE",
  "AWS_DEFAULT_PROFILE",
  "AWS_PROFILE",
  "AWS_ROLE_ARN",
  "AWS_ROLE_SESSION_NAME",
  "AWS_SHARED_CREDENTIALS_FILE",
  "AWS_WEB_IDENTITY_TOKEN_FILE",
]);

/**
 * The host process variables an invocation keeps, with the ones naming a
 * credential source of the host's own left out.
 */
export function withoutHostAwsCredentialVariables(
  variables: Record<string, string>,
): Record<string, string> {
  const kept: [string, string][] = [];

  for (const [name, value] of Object.entries(variables)) {
    if (!hostAwsCredentialVariableNames.has(name)) {
      kept.push([name, value]);
    }
  }

  return Object.fromEntries(kept);
}
