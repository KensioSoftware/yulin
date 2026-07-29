/**
 * Listing the users of a simulated user pool.
 */

import {
  AdminCreateUserCommand,
  CreateUserPoolCommand,
  ListUsersCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const cognito = simAws.cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool?.Id;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
);

const listed = await cognito.listUsers(
  new ListUsersCommand({ UserPoolId: userPoolId }),
);

console.log(listed.Users?.map((user) => user.Username)); // [ "alice", "bob" ]
