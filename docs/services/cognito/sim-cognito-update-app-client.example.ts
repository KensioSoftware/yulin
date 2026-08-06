/**
 * Changing a simulated app client's settings, which replaces them rather than
 * merging into them.
 */

import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
  }),
);

const updated = await cognito.updateUserPoolClient(
  new UpdateUserPoolClientCommand({
    UserPoolId: pool.UserPool?.Id,
    ClientId: appClient.UserPoolClient?.ClientId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
    AccessTokenValidity: 5,
    TokenValidityUnits: { AccessToken: "minutes" },
  }),
);

// The next sign-in gets an access token lasting five minutes.
console.log(updated.UserPoolClient?.AccessTokenValidity); // 5
console.log(updated.UserPoolClient?.LastModifiedDate); // when the update ran
