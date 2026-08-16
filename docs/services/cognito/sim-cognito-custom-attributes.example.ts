/**
 * A user pool holding an application's own identifier for a user.
 */

import {
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    Schema: [
      // Immutable, because this is the identifier the application keys its own
      // data on: Cognito takes it when the user is created and refuses every
      // write after that.
      { Name: "userId", AttributeDataType: "String", Mutable: false },
      {
        Name: "seats",
        AttributeDataType: "Number",
        Mutable: true,
        NumberAttributeConstraints: { MinValue: "1", MaxValue: "10" },
      },
    ],
  }),
);
const userPoolId = pool.UserPool!.Id!;

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
    UserAttributes: [
      { Name: "custom:userId", Value: "usr_01H8" },
      { Name: "custom:seats", Value: "3" },
    ],
  }),
);

const user = await cognito.adminGetUser(
  new AdminGetUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);

console.log(user.UserAttributes?.find((each) => each.Name === "custom:userId"));
// { Name: "custom:userId", Value: "usr_01H8" }

// A mutable attribute changes.
await cognito.adminUpdateUserAttributes(
  new AdminUpdateUserAttributesCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    UserAttributes: [{ Name: "custom:seats", Value: "7" }],
  }),
);

// The pool reports its whole schema, the standard attributes included.
const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
);

console.log(
  described.UserPool?.SchemaAttributes?.map((attribute) => attribute.Name),
);
// [ "sub", "address", ..., "custom:userId", "custom:seats" ]
