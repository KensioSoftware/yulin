/**
 * Saying who is signed in at a simulated identity provider.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();

declare const userPoolId: string;

cognito
  .userPool(userPoolId)
  .auth.identityProviders.require("Google")
  .signInAs({
    Subject: "108412093487519382745",
    Claims: { email: "someone@example.com", given_name: "Someone" },
  });
