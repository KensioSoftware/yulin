/**
 * Creating a pool that recovers an account by email alone.
 */

import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    AccountRecoverySetting: {
      RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }],
    },
  }),
);

const userPoolId = created.UserPool?.Id;

// The pool reports back the mechanisms it was asked for, rather than the two
// real Cognito gives a pool that asked for none.
const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
);

console.log(described.UserPool?.AccountRecoverySetting);
// { RecoveryMechanisms: [{ Name: "verified_email", Priority: 1 }] }
