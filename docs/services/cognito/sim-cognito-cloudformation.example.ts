/**
 * Deploying a user pool, an app client and a group from a template.
 */

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws({ defaultRegionName: "eu-west-2" });

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "app-stack",
  template: {
    Resources: {
      AppPool: {
        Type: "AWS::Cognito::UserPool",
        Properties: {
          UserPoolName: "myapp-users",
          Policies: { PasswordPolicy: { MinimumLength: 12 } },
        },
      },
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          ClientName: "web",
          ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
        },
      },
      AdminsGroup: {
        Type: "AWS::Cognito::UserPoolGroup",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          GroupName: "admins",
          Precedence: 0,
        },
      },
    },
    Outputs: {
      UserPoolId: { Value: { Ref: "AppPool" } },
      ClientId: { Value: { Ref: "AppClient" } },
      ProviderUrl: { Value: { "Fn::GetAtt": ["AppPool", "ProviderURL"] } },
    },
  },
});
await stack.waitForDeployComplete();

const userPoolId = stack.output("UserPoolId");
const clientId = stack.output("ClientId");

console.log(userPoolId); // "eu-west-2_aBcDeFgHi"
console.log(stack.output("ProviderUrl"));
// "https://cognito-idp.eu-west-2.amazonaws.com/eu-west-2_aBcDeFgHi"

// The deployed pool, client and group are what the test then works with.
const cognito = simAws.cognitoIdentityProvider();

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecretPassw0rd!",
    Permanent: true,
  }),
);
await cognito.adminAddUserToGroup(
  new AdminAddUserToGroupCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    GroupName: "admins",
  }),
);

// The sign-in runs through the flow the template opened on the app client.
const { AuthenticationResult } = await cognito.adminInitiateAuth(
  new AdminInitiateAuthCommand({
    UserPoolId: userPoolId,
    ClientId: clientId,
    AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecretPassw0rd!" },
  }),
);

console.log(AuthenticationResult?.AccessToken !== undefined); // true
