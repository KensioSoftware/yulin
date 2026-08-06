/**
 * The Lambda triggers a simulated user pool runs.
 *
 * These are the ones that fire around a sign-up, around a sign-in, and over the
 * tokens a sign-in hands out, which is the part of a user's life this
 * simulation has. A pool sends no messages and federates with nobody, so the
 * message and federation triggers would never run whatever a pool named for
 * them.
 */
export const simCognitoTriggerNames = [
  "PreSignUp",
  "PostConfirmation",
  "PreAuthentication",
  "PostAuthentication",
  "PreTokenGeneration",
] as const;

export type SimCognitoTriggerName = (typeof simCognitoTriggerNames)[number];

/**
 * The `LambdaConfig` keys real Cognito has that this simulation does not run,
 * and why each one is refused rather than accepted and ignored.
 *
 * A pool that accepted one of these would sign users up or in without ever
 * calling the function the template named, which is the difference between a
 * stack that works here and one that works deployed.
 */
export const simCognitoUnsimulatedTriggers: ReadonlyMap<string, string> =
  new Map([
    [
      "PreTokenGenerationConfig",
      "the V2_0 and V3_0 token triggers, which customise access token claims " +
        "and scopes. Name the function in PreTokenGeneration for the V1_0 " +
        "trigger, which customises the id token",
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
