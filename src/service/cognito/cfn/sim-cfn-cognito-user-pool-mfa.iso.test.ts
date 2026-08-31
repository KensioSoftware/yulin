import {
  ConfirmSignUpCommand,
  DescribeUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySuccess,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const password = "Sup3rSecret!";

/**
 * The AWS::Cognito::UserPool properties `aws-cdk-lib` 2.263.0 emits for a
 * `UserPool` construct asking for optional MFA with a time-based one-time
 * password as the second factor, alongside a client-side app client.
 *
 * That is an ordinary product decision to record in a stack: users may turn a
 * second factor on, and the pool offers an authenticator app rather than SMS.
 * None of the sign-up and sign-in flows below involve a second factor.
 */
const verificationMessage =
  "The verification code to your new account is {####}";

const mfaPoolResources = {
  SiteUserPool: {
    Type: "AWS::Cognito::UserPool",
    Properties: {
      UserPoolName: "myapp-users",
      AccountRecoverySetting: {
        RecoveryMechanisms: [
          { Name: "verified_phone_number", Priority: 1 },
          { Name: "verified_email", Priority: 2 },
        ],
      },
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      AutoVerifiedAttributes: ["email"],
      EmailVerificationMessage: verificationMessage,
      EmailVerificationSubject: "Verify your new account",
      EnabledMfas: ["SOFTWARE_TOKEN_MFA"],
      MfaConfiguration: "OPTIONAL",
      SmsVerificationMessage: verificationMessage,
    },
  },
  SiteUserPoolClient: {
    Type: "AWS::Cognito::UserPoolClient",
    Properties: {
      UserPoolId: { Ref: "SiteUserPool" },
      ClientName: "web",
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    },
  },
};

const mfaPoolOutputs = {
  PoolId: { Value: { Ref: "SiteUserPool" } },
  ClientId: { Value: { Ref: "SiteUserPoolClient" } },
};

describe("Cognito CloudFormation user pool MFA", () => {
  it("deploys a pool declaring optional MFA and signs a user up in it", async () => {
    // Given a stack whose pool offers optional MFA through an authenticator
    // app.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(simAws, mfaPoolResources, mfaPoolOutputs);

    // Then the pool deployed, rather than the MFA declaration taking the whole
    // stack down.
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;
    assertTypeString(userPoolId);
    assertTypeString(clientId);
    assertArrayEmpty(stack.ignoredProperties);

    // And the pool reports the setting the template asked for, with the factor
    // behind it, which real CloudFormation configures in a second call once
    // the pool exists.
    const cognito = simAws.cognitoIdentityProvider();
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );
    assertIdentical(described.UserPool?.MfaConfiguration, "OPTIONAL");

    const mfa = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );
    assertIdentical(mfa.MfaConfiguration, "OPTIONAL");
    assertTrue(mfa.SoftwareTokenMfaConfiguration?.Enabled);

    // And everything that is not MFA goes on working against it: a user signs
    // itself up, confirms, and signs in with a password alone.
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

  it("deploys a pool offering a second factor by text message", async () => {
    // Given a template whose pool requires MFA and offers both factors, which
    // is what a CDK UserPool with an sms second factor emits.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(
      simAws,
      {
        AppPool: {
          Type: "AWS::Cognito::UserPool",
          Properties: {
            UserPoolName: "myapp-users",
            MfaConfiguration: "ON",
            EnabledMfas: ["SMS_MFA", "SOFTWARE_TOKEN_MFA"],
          },
        },
      },
      { PoolId: { Value: { Ref: "AppPool" } } },
    );
    const userPoolId = stack.outputs.get("PoolId")?.value;
    assertTypeString(userPoolId);

    // Then both factors are configured on the pool, rather than the SMS one
    // taking the stack down.
    const mfa = await simAws
      .cognitoIdentityProvider()
      .getUserPoolMfaConfig(
        new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
      );

    assertIdentical(mfa.MfaConfiguration, "ON");
    assertTrue(mfa.SoftwareTokenMfaConfiguration?.Enabled);
    assertNonNullable(mfa.SmsMfaConfiguration);
  });

  it("leaves a pool that says nothing about MFA unconfigured", async () => {
    // Given a template declaring a pool with no MFA at all.
    const simAws = simAwsInEuWest2();

    // When it is deployed.
    const stack = await deploySuccess(
      simAws,
      {
        AppPool: {
          Type: "AWS::Cognito::UserPool",
          Properties: { UserPoolName: "myapp-users" },
        },
      },
      { PoolId: { Value: { Ref: "AppPool" } } },
    );
    const userPoolId = stack.outputs.get("PoolId")?.value;
    assertTypeString(userPoolId);

    // Then the pool has MFA off and no factor was configured for it, because
    // no SetUserPoolMfaConfig call was made at all.
    const mfa = await simAws
      .cognitoIdentityProvider()
      .getUserPoolMfaConfig(
        new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
      );

    assertIdentical(mfa.MfaConfiguration, "OFF");
    assertUndefined(mfa.SoftwareTokenMfaConfiguration);
  });
});
