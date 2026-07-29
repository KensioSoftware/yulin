/**
 * Intercepting a CognitoIdentityProviderClient into simulated Cognito.
 */

import {
  CognitoIdentityProviderClient,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimSdk } from "@kensio/yulin/sdk";

const simSdk = new SimSdk();
simSdk.intercept(CognitoIdentityProviderClient);

// The code under test uses the AWS SDK as normal.
const client = new CognitoIdentityProviderClient({ region: "eu-west-2" });

const created = await client.send(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const described = await client.send(
  new DescribeUserPoolCommand({ UserPoolId: created.UserPool?.Id }),
);

console.log(described.UserPool?.Id); // "eu-west-2_aBcDeFgHi"

simSdk.restoreAll();
