/**
 * A PostConfirmation trigger that runs on a federated user's first sign-in.
 */

import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

import type { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

/**
 * The part of the PostConfirmation event this handler reads.
 */
interface PostConfirmationEvent {
  readonly triggerSource: string;
  readonly userName: string;
}

// A pool with a domain, a Google provider and an app client, as
// [the hosted domain example](#signing-in-through-a-hosted-domain) builds one.
declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;
declare const callbackUrl: string;

const written: string[] = [];

// A record is written here. A deployed handler writes it to DynamoDB.
const handler = (event: PostConfirmationEvent): unknown => {
  written.push(`${event.triggerSource} ${event.userName}`);

  return event;
};

// The function the pool's `LambdaConfig` names in its `PostConfirmation`.
await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "post-confirmation",
    Role: "arn:aws:iam::123456789012:role/TriggerRole",
    Code: { ZipFile: makeLambdaZipFileInput(handler) },
  }),
);

const cognito = simAws.cognitoIdentityProvider();
const pool = cognito.userPool(userPoolId);

pool.auth.identityProviders.require("Google").signInAs({
  Subject: "108412093487519382745",
  Claims: { email: "someone@example.com" },
});

const authorize = {
  response_type: "code",
  client_id: clientId,
  redirect_uri: callbackUrl,
  identity_provider: "Google",
};

// The first sign-in creates the pool's user for the subject.
await cognito.hostedAuthorize(pool, authorize);
console.log(written);
// ["PostConfirmation_ConfirmSignUp Google_108412093487519382745"]

// The second reaches the same user, and the sign-up triggers stay unfired.
await cognito.hostedAuthorize(pool, authorize);
console.log(written.length); // 1
