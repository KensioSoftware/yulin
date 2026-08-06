/**
 * The Lambda triggers a simulated user pool runs.
 *
 * These are the ones that fire around a sign-up and around a sign-in, which is
 * the part of a user's life this simulation has. A pool sends no messages and
 * federates with nobody, so the message and federation triggers would never run
 * whatever a pool named for them.
 */
export const simCognitoTriggerNames = [
  "PreSignUp",
  "PostConfirmation",
  "PreAuthentication",
  "PostAuthentication",
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
