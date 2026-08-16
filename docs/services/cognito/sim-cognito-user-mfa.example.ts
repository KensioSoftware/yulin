/**
 * Registering an authenticator app for a user of a simulated pool.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AssociateSoftwareTokenCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  GetUserCommand,
  InitiateAuthCommand,
  SetUserMFAPreferenceCommand,
  SetUserPoolMfaConfigCommand,
  VerifySoftwareTokenCommand,
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

await cognito.setUserPoolMfaConfig(
  new SetUserPoolMfaConfigCommand({
    UserPoolId: userPoolId,
    MfaConfiguration: "OPTIONAL",
    SoftwareTokenMfaConfiguration: { Enabled: true },
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);
const clientId = appClient.UserPoolClient!.ClientId!;

await cognito.adminCreateUser(
  new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "alice" }),
);
await cognito.adminSetUserPassword(
  new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: "alice",
    Password: "Sup3rSecret!",
    Permanent: true,
  }),
);

const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);
const AccessToken = signedIn.AuthenticationResult!.AccessToken!;

// The secret an authenticator app would be given, behind a QR code.
const associated = await cognito.associateSoftwareToken(
  new AssociateSoftwareTokenCommand({ AccessToken }),
);

console.log(typeof associated.SecretCode); // "string"

// The code the user's app is showing, which a test reads off the pool rather
// than computing from the secret itself.
const verified = await cognito.verifySoftwareToken(
  new VerifySoftwareTokenCommand({
    AccessToken,
    UserCode: cognito.userPool(userPoolId).softwareTokenCode("alice"),
  }),
);

console.log(verified.Status); // "SUCCESS"

// Verifying registers the token. Turning the factor on is a step of its own.
await cognito.setUserMFAPreference(
  new SetUserMFAPreferenceCommand({
    AccessToken,
    SoftwareTokenMfaSettings: { Enabled: true, PreferredMfa: true },
  }),
);

const user = await cognito.getUser(new GetUserCommand({ AccessToken }));

console.log(user.UserMFASettingList); // ["SOFTWARE_TOKEN_MFA"]
console.log(user.PreferredMfaSetting); // "SOFTWARE_TOKEN_MFA"
