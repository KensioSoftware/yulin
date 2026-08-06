/**
 * Changing a simulated user pool's settings.
 */

import {
  CreateUserPoolCommand,
  DeleteUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const created = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    DeletionProtection: "ACTIVE",
    Policies: { PasswordPolicy: { MinimumLength: 12 } },
  }),
);

const UserPoolId = created.UserPool?.Id;

await cognito.updateUserPool(
  new UpdateUserPoolCommand({ UserPoolId, DeletionProtection: "INACTIVE" }),
);

const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId }),
);

console.log(described.UserPool?.DeletionProtection); // "INACTIVE"

// The update said nothing about the password policy, so it is back at the
// default rather than the twelve characters the pool was created with.
console.log(described.UserPool?.Policies?.PasswordPolicy?.MinimumLength); // 8

// The pool can be deleted now its protection is off.
await cognito.deleteUserPool(new DeleteUserPoolCommand({ UserPoolId }));
