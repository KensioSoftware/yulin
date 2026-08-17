/**
 * Signing one of a pool's own users in at the authorize endpoint.
 */

import type { SimAws } from "@kensio/yulin";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const cognito = simAws.cognitoIdentityProvider();
const pool = cognito.userPool(userPoolId);
const callbackUrl = "https://www.example.com/user/callback";

// The two fields managed login's form would have taken, passed with the
// parameters the browser arrived on.
const redirect = await cognito.hostedAuthorize(pool, {
  response_type: "code",
  client_id: clientId,
  redirect_uri: callbackUrl,
  scope: "openid email",
  state: "csrf-token",
  username: "alice",
  password: "Sup3rSecret!",
});

const callback = new URL(redirect.location);
console.log(callback.searchParams.get("state")); // "csrf-token"

// The application's own server exchanges the code, as it does after a
// federated sign-in.
const tokens = await cognito.hostedToken(pool, {
  grant_type: "authorization_code",
  client_id: clientId,
  code: callback.searchParams.get("code")!,
  redirect_uri: callbackUrl,
});

console.log(tokens.token_type); // "Bearer"
