/**
 * A browser signing in once with its password, and again from its session.
 */

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const cognito = simAws.cognitoIdentityProvider();
const pool = cognito.userPool(userPoolId);
const parameters = {
  response_type: "code",
  client_id: clientId,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid email",
};

const first = await cognito.hostedAuthorize(pool, {
  ...parameters,
  username: "alice",
  password: "Sup3rSecret!",
});

console.log(first.session.outcome); // "started"

// The same browser, sent back to authorize carrying no credentials.
const second = await cognito.hostedAuthorize(
  pool,
  parameters,
  first.session.startedSession,
);

console.log(second.session.outcome); // "reused"
console.log(second.username); // "alice"
