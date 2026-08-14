/**
 * Completing an authorization code grant against a simulated hosted domain.
 */

import { CognitoJwtVerifier } from "aws-jwt-verify";

import type { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;
declare const clientSecret: string;

const http = new SimAwsHttp({ simAws });
const callbackUrl = "https://www.example.com/user/callback";
const hosted = (path: string, query = ""): string =>
  `https://myapp-login.auth.eu-west-2.amazoncognito.com${path}${query}`;

// The browser is sent to the authorize endpoint, naming the provider.
const authorizeQuery = new URLSearchParams({
  response_type: "code",
  client_id: clientId,
  redirect_uri: callbackUrl,
  scope: "openid email",
  state: "csrf-token",
  identity_provider: "Google",
});
const authorized = await http.fetch(
  hosted("/oauth2/authorize", `?${authorizeQuery.toString()}`),
);

console.log(authorized.status); // 302

// It comes back to the callback URL with a code and the state it was given.
const callback = new URL(authorized.headers.get("location")!);
const code = callback.searchParams.get("code")!;
console.log(callback.searchParams.get("state")); // "csrf-token"

// The application's own server exchanges the code, authenticating as the app
// client with its secret.
const exchanged = await http.fetch(hosted("/oauth2/token"), {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
  },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: callbackUrl,
  }).toString(),
});

const tokens = (await exchanged.json()) as {
  access_token: string;
  id_token: string;
  refresh_token: string;
  expires_in: number;
};

const verifier = CognitoJwtVerifier.create({
  userPoolId,
  tokenUse: "id",
  clientId,
});
verifier.cacheJwks(
  simAws.cognitoIdentityProvider().userPool(userPoolId).jwks(),
);

const claims = await verifier.verify(tokens.id_token);
console.log(claims["cognito:username"]); // "Google_108412093487519382745"
console.log(claims["email"]); // "someone@example.com"
