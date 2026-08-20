import {
  ConfirmSignUpCommand,
  DescribeUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertArrayLength,
  assertObjectMatches,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySuccess,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const password = "Sup3rSecret!";

/**
 * The AWS::Cognito::UserPool properties `aws-cdk-lib` 2.264.0 emits for a
 * `UserPool` construct with `signInPolicy`, `passkeyRelyingPartyId` and
 * `passkeyUserVerification` set, alongside an app client whose `authFlows`
 * include `user`.
 *
 * That is the stack AWS asks for under "Protect other secrets", where the best
 * practice is passwordless authentication with WebAuthn passkeys. The relying
 * party ID is the apex rather than the pool's own domain, because a passkey
 * authenticates for the name it was registered against and the hosts under it.
 */
const passkeyPoolResources = {
  SiteUserPool: {
    Type: "AWS::Cognito::UserPool",
    Properties: {
      UserPoolName: "myapp-users",
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      AutoVerifiedAttributes: ["email"],
      MfaConfiguration: "OPTIONAL",
      EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
      WebAuthnRelyingPartyID: "example.com",
      WebAuthnUserVerification: "required",
    },
  },
  SiteUserPoolClient: {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "SiteUserPool" },
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_USER_AUTH"],
    },
  },
};

const passkeyPoolOutputs = {
  PoolId: { Value: { Ref: "SiteUserPool" } },
  ClientId: { Value: { Ref: "SiteUserPoolClient" } },
};

describe("Cognito CloudFormation user pool passkeys", () => {
  it("deploys a pool that allows passkeys and reports how it registers them", async () => {
    // Given a stack whose pool allows a passkey beside a password.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(
      simAws,
      passkeyPoolResources,
      passkeyPoolOutputs,
    );

    // Then the pool deployed, rather than one passkey property taking the
    // whole stack down, and nothing was created without.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);
    assertArrayLength(stack.ignoredProperties, 0);

    // And the pool reports the factors it allows at the first prompt.
    const cognito = simAws.cognitoIdentityProvider();
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    assertArrayEquals(
      described.UserPool?.Policies?.SignInPolicy?.AllowedFirstAuthFactors,
      ["PASSWORD", "WEB_AUTHN"],
    );

    // And it reports how a passkey would be registered, which real
    // CloudFormation configures in a second call once the pool exists.
    const mfa = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );
    assertObjectMatches(mfa.WebAuthnConfiguration, {
      RelyingPartyId: "example.com",
      UserVerification: "required",
    });

    // And the password half of that policy goes on working: a user signs
    // itself up, confirms, and signs in.
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "alice",
        Password: password,
        UserAttributes: [{ Name: "email", Value: "alice@example.com" }],
      }),
    );
    await cognito.confirmSignUp(
      new ConfirmSignUpCommand({
        ClientId: clientId,
        Username: "alice",
        ConfirmationCode: cognito
          .userPool(userPoolId)
          .confirmationCode("alice"),
      }),
    );

    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: password },
      }),
    );
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });
});
