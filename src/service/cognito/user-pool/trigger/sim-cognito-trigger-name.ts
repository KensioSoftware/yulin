/**
 * The Lambda triggers a simulated user pool runs.
 *
 * These two are the ones that fire around a sign-in, which is the only part of
 * a user's life this simulation has: `AdminCreateUser` is how a user comes to
 * exist here, and a pool sends no messages, so the sign-up and message triggers
 * would never run whatever a pool named for them.
 */
export const simCognitoTriggerNames = [
  "PreAuthentication",
  "PostAuthentication",
] as const;

export type SimCognitoTriggerName = (typeof simCognitoTriggerNames)[number];

/**
 * What real Cognito calls a trigger when it invokes it.
 *
 * A handler reads `triggerSource` to tell apart the several occasions one
 * trigger fires on, so the value has to be the real one rather than the
 * trigger's own name. Each of these two has a single source here, because the
 * other sources name flows this simulation does not run.
 */
export function simCognitoTriggerSource(
  trigger: SimCognitoTriggerName,
): string {
  return trigger === "PreAuthentication"
    ? "PreAuthentication_Authentication"
    : "PostAuthentication_Authentication";
}

/**
 * The `LambdaConfig` keys real Cognito has that this simulation does not run,
 * and why each one is refused rather than accepted and ignored.
 *
 * A pool that accepted one of these would sign users in without ever calling
 * the function the template named, which is the difference between a stack
 * that works here and one that works deployed.
 */
export const simCognitoUnsimulatedTriggers: ReadonlyMap<string, string> =
  new Map([
    ["PreSignUp", "validating a self-service sign-up"],
    ["PostConfirmation", "acting on a user confirming its own account"],
    ["PreTokenGeneration", "changing the claims a pool puts in its tokens"],
    [
      "PreTokenGenerationConfig",
      "changing the claims a pool puts in its tokens",
    ],
    ["CustomMessage", "writing the wording of a message the pool sends"],
    ["DefineAuthChallenge", "the custom authentication challenge flow"],
    ["CreateAuthChallenge", "the custom authentication challenge flow"],
    ["VerifyAuthChallengeResponse", "the custom authentication challenge flow"],
    [
      "UserMigration",
      "importing a user from an external directory on first sign-in",
    ],
    ["CustomEmailSender", "sending the pool's email through a function"],
    ["CustomSMSSender", "sending the pool's SMS through a function"],
    [
      "KMSKeyID",
      "the key the custom sender triggers encrypt their codes under",
    ],
  ]);
