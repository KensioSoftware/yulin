/**
 * Registering a simulated Cognito user pool and app client with chosen ids.
 */

import { DescribeUserPoolClientCommand } from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
const cognito = simAws.cognitoIdentityProvider();

// The ids the CDK app pins, the stack that creates the pool being another one.
cognito.registerUserPool({
  id: "eu-west-2_aBcDeFgHi",
  name: "myapp-users",
  settings: { Policies: { PasswordPolicy: { MinimumLength: 12 } } },
});

cognito.registerUserPoolClient({
  userPoolId: "eu-west-2_aBcDeFgHi",
  id: "examplewebclient0000000000",
  name: "web",
  settings: { ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"] },
});

const described = await cognito.describeUserPoolClient(
  new DescribeUserPoolClientCommand({
    UserPoolId: "eu-west-2_aBcDeFgHi",
    ClientId: "examplewebclient0000000000",
  }),
);

console.log(described.UserPoolClient?.ClientName);
