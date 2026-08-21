/**
 * Registering a passkey for a signed-in user.
 */

import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CompleteWebAuthnRegistrationCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  SetUserPoolMfaConfigCommand,
  StartWebAuthnRegistrationCommand,
} from "@aws-sdk/client-cognito-identity-provider";

import { SimAws } from "@kensio/yulin";

const cognito = new SimAws().cognitoIdentityProvider();

const pool = await cognito.createUserPool(
  new CreateUserPoolCommand({ PoolName: "myapp-users" }),
);
const userPoolId = pool.UserPool!.Id!;

// A passkey belongs to a domain, and the pool has to name the one it registers
// against.
await cognito.setUserPoolMfaConfig(
  new SetUserPoolMfaConfigCommand({
    UserPoolId: userPoolId,
    MfaConfiguration: "OPTIONAL",
    WebAuthnConfiguration: {
      RelyingPartyId: "myapp.example.com",
      UserVerification: "required",
    },
  }),
);

const appClient = await cognito.createUserPoolClient(
  new CreateUserPoolClientCommand({
    UserPoolId: userPoolId,
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
  }),
);

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

// A passkey is added from a session that already exists, so the user signs in
// with its password first.
const signedIn = await cognito.initiateAuth(
  new InitiateAuthCommand({
    ClientId: appClient.UserPoolClient!.ClientId!,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: "alice", PASSWORD: "Sup3rSecret!" },
  }),
);
const AccessToken = signedIn.AuthenticationResult!.AccessToken!;

// The options a browser would hand to navigator.credentials.create().
await cognito.startWebAuthnRegistration(
  new StartWebAuthnRegistrationCommand({ AccessToken }),
);

// The credential that browser's authenticator would have handed back.
await cognito.completeWebAuthnRegistration(
  new CompleteWebAuthnRegistrationCommand({
    AccessToken,
    Credential: cognito.userPool(userPoolId).webAuthnCredential("alice"),
  }),
);

const listed = await cognito.listWebAuthnCredentials(
  new ListWebAuthnCredentialsCommand({ AccessToken }),
);

console.log(listed.Credentials?.[0]?.RelyingPartyId); // "myapp.example.com"
