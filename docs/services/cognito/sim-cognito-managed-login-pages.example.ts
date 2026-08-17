/**
 * Signing up, confirming and signing in through the served pages.
 */

import type { SimAws } from "@kensio/yulin";
import { SimAwsHttp } from "@kensio/yulin/serve";

declare const simAws: SimAws;
declare const userPoolId: string;
declare const clientId: string;

const http = new SimAwsHttp({ simAws });
const domain = "https://myapp-login.auth.eu-west-2.amazoncognito.com";
const parameters = {
  response_type: "code",
  client_id: clientId,
  redirect_uri: "https://www.example.com/user/callback",
  scope: "openid email",
  state: "csrf-token",
};

const posted = async (
  path: string,
  fields: Record<string, string>,
): Promise<Response> =>
  http.fetch(`${domain}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...parameters, ...fields }).toString(),
  });

// The sign-in page is what the authorize endpoint answers a browser with.
const signInPage = await http.fetch(
  `${domain}/oauth2/authorize?${new URLSearchParams(parameters).toString()}`,
);
console.log(signInPage.headers.get("content-type")); // "text/html; charset=utf-8"

// The sign-up form creates the user, unconfirmed.
await posted("/signup", { username: "alice", password: "Sup3rSecret!" });

// The code the pool would have emailed is read off the pool.
const pool = simAws.cognitoIdentityProvider().userPool(userPoolId);
await posted("/confirm", {
  username: "alice",
  code: pool.confirmationCode("alice") ?? "",
});

// That same user then signs in and reaches the callback with a code.
const signedIn = await posted("/oauth2/authorize", {
  username: "alice",
  password: "Sup3rSecret!",
});
const callbackUrl = new URL(signedIn.headers.get("location")!);
console.log(callbackUrl.searchParams.get("state")); // "csrf-token"
console.log(callbackUrl.searchParams.get("code") !== null); // true
