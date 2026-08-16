/**
 * A user pool that offers multi-factor authentication.
 */

import {
  ConfirmSignUpCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  InitiateAuthCommand,
  SetUserPoolMfaConfigCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({
    PoolName: "myapp-users",
    MfaConfiguration: "OPTIONAL",
  }),
);
const userPoolId = pool.UserPool!.Id!;

// Which factors the pool offers is set separately, as it is on real Cognito.
await cognito.setUserPoolMfaConfig(
  new SetUserPoolMfaConfigCommand({
    UserPoolId: userPoolId,
    MfaConfiguration: "OPTIONAL",
    SoftwareTokenMfaConfiguration: { Enabled: true },
  }),
);

const described = await cognito.describeUserPool(
  new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
);

console.log(described.UserPool?.MfaConfiguration); // "OPTIONAL"

const mfa = await cognito.getUserPoolMfaConfig(
  new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
);

console.log(mfa.SoftwareTokenMfaConfiguration?.Enabled); // true

// A user of the pool signs up and signs in with a password alone, because no
// user here has registered a second factor.
const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.signUp(
  new SignUpCommand({
    ClientId: clientId,
    Username: "alice",
    Password: "Sup3rSecret!",
  }),
);

await cognito.confirmSignUp(
  new ConfirmSignUpCommand({
    ClientId: clientId,
    Username: "alice",
    ConfirmationCode: cognito.userPool(userPoolId).confirmationCode("alice"),
  }),
);

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);

console.log(typeof signedIn.AuthenticationResult?.AccessToken); // "string"
