import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  DescribeUserPoolClientCommand,
  GetTokensFromRefreshTokenCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deploySuccess,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/cognito/cfn-deploy.js";

const password = "Correct-horse-1";

/**
 * The AWS::Cognito::UserPoolClient properties `aws-cdk-lib` emits for a client
 * given a `refreshTokenRotationGracePeriod`, which is a `RefreshTokenRotation`
 * and no `ALLOW_REFRESH_TOKEN_AUTH` among the flows.
 */
const rotatingClient = {
  Type: "AWS::Cognito::UserPoolClient",
  Properties: {
    UserPoolId: { Ref: "AppPool" },
    ClientName: "web",
    ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH"],
    RefreshTokenRotation: { Feature: "ENABLED", RetryGracePeriodSeconds: 30 },
  },
};

const appPool = {
  Type: "AWS::Cognito::UserPool",
  Properties: { UserPoolName: "myapp-users" },
};

const outputs = {
  PoolId: { Value: { Ref: "AppPool" } },
  ClientId: { Value: { Ref: "AppClient" } },
};

describe("Cognito CloudFormation refresh token rotation", () => {
  it("deploys an app client that rotates its refresh tokens", async () => {
    // Given a stack whose app client carries a RefreshTokenRotation.
    const simAws = simAwsInEuWest2();
    const stack = await deploySuccess(
      simAws,
      { AppPool: appPool, AppClient: rotatingClient },
      outputs,
    );
    const userPoolId = stack.outputs.get("PoolId")?.value;
    const clientId = stack.outputs.get("ClientId")?.value;

    assertTypeString(userPoolId);
    assertTypeString(clientId);

    // When a user signs in through it and renews the session.
    const cognito = simAws.cognitoIdentityProvider();

    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "ada" }),
    );
    await cognito.adminSetUserPassword(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: "ada",
        Password: password,
        Permanent: true,
      }),
    );

    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "ada", PASSWORD: password },
      }),
    );
    const renewed = await cognito.getTokensFromRefreshToken(
      new GetTokensFromRefreshTokenCommand({
        ClientId: clientId,
        RefreshToken: signedIn.AuthenticationResult?.RefreshToken,
      }),
    );

    // Then the deployed client rotates, rather than being deployed with
    // rotation off and proving the wrong thing.
    const described = await cognito.describeUserPoolClient(
      new DescribeUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
      }),
    );

    assertObjectEquals(described.UserPoolClient?.RefreshTokenRotation, {
      Feature: "ENABLED",
      RetryGracePeriodSeconds: 30,
    });
    assertNonNullable(renewed.AuthenticationResult?.RefreshToken);
  });

  it("records a RefreshTokenRotation key it does not model", async () => {
    // Given a template carrying a key nothing reads inside the rotation.
    const stack = await deploySuccess(simAwsInEuWest2(), {
      AppPool: appPool,
      AppClient: {
        Type: "AWS::Cognito::UserPoolClient",
        Properties: {
          UserPoolId: { Ref: "AppPool" },
          RefreshTokenRotation: { Feature: "ENABLED", RotateEveryUse: true },
        },
      },
    });

    // Then it is recorded rather than dropped on the way to the Command with
    // nothing said about it.
    const [reason] = ignoredReasons(stack);

    assertNonNullable(reason);
    assertStringIncludes(
      reason,
      "property RefreshTokenRotation RotateEveryUse is not simulated",
    );
  });
});
