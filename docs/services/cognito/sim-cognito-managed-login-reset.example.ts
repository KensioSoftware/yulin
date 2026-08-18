/**
 * Resetting a forgotten password through the served pages.
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

// A confirmed user of the pool has forgotten its password.
await posted("/forgotPassword", { username: "alice" });

// The code the pool would have emailed is read off the pool, as a sign-up
// code is.
const pool = simAws.cognitoIdentityProvider().userPool(userPoolId);
await posted("/confirmForgotPassword", {
  username: "alice",
  code: pool.confirmationCode("alice") ?? "",
  password: "Ev3nBetter!",
});

// The user signs in with the new password and reaches the callback with a
// code and the state the application began with.
const signedIn = await posted("/oauth2/authorize", {
  username: "alice",
  password: "Ev3nBetter!",
});
const callbackUrl = new URL(signedIn.headers.get("location")!);
console.log(callbackUrl.searchParams.get("state")); // "csrf-token"
console.log(callbackUrl.searchParams.get("code") !== null); // true
