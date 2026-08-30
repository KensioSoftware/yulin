import {
  AdminInitiateAuthCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoForMetrics,
  simCognitoMetricDatapoint,
  simCognitoMetricPassword,
  simCognitoMetricUser,
} from "../../../../test/cognito/metric-fixture.js";

function signIn(clientId: string, password: string): InitiateAuthCommand {
  return new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: simCognitoMetricUser,
      PASSWORD: password,
    },
  });
}

describe("AWS/Cognito sign-in metrics a simulated user pool publishes", () => {
  it("counts a sign-in that issued tokens", async () => {
    // Given a pool with a confirmed user.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics();

    // When the user signs in.
    await cognito.initiateAuth(signIn(clientId, simCognitoMetricPassword));

    // Then the pool counted one successful authentication request, under the
    // app client the request came through.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(reading);
    assertIdentical(reading.Sum, 1);
    assertIdentical(reading.SampleCount, 1);
  });

  it("counts a refused sign-in as a request that succeeded none of the time", async () => {
    // Given a pool with a confirmed user.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics();

    // When one sign-in gives the wrong password and one gives the right one.
    await assertThrowsErrorAsync(
      async () =>
        await cognito.initiateAuth(signIn(clientId, "Wr0ngPassword!")),
    );
    await cognito.initiateAuth(signIn(clientId, simCognitoMetricPassword));

    // Then both were counted, and the average between them is the success
    // rate, which is how the AWS documentation says to read the metric.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(reading);
    assertIdentical(reading.SampleCount, 2);
    assertIdentical(reading.Sum, 1);
    assertIdentical(reading.Average, 0.5);
  });

  it("counts an admin sign-in the same way", async () => {
    // Given a pool whose app client allows the admin password flow.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics({
        explicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
      });

    // When an administrator signs the user in.
    await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: userPoolId,
        ClientId: clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: {
          USERNAME: simCognitoMetricUser,
          PASSWORD: simCognitoMetricPassword,
        },
      }),
    );

    // Then it counted under the app client the request named, because an
    // admin sign-in still goes through one.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(reading);
    assertIdentical(reading.Sum, 1);
  });

  it("reports a client the pool has none of under a fixed name", async () => {
    // Given a pool that knows nothing of the app client a request will name.
    const { simAws, cognito, userPoolId } = await simCognitoForMetrics();

    // When an admin request names an app client that is not there.
    const unknownClient = new AdminInitiateAuthCommand({
      UserPoolId: userPoolId,
      ClientId: "1h57kf5cpq17m0eml12EXAMPLE",
      AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
      AuthParameters: { USERNAME: simCognitoMetricUser },
    });

    await assertThrowsErrorAsync(
      async () => await cognito.adminInitiateAuth(unknownClient),
    );

    // Then the request was counted as a failure against `Invalid`, and the id
    // it gave is left out of the metric.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      "Invalid",
    );

    assertNonNullable(reading);
    assertIdentical(reading.SampleCount, 1);
    assertIdentical(reading.Sum, 0);
  });

  it("keeps a token refresh out of the sign-in count", async () => {
    // Given a user signed in on a client that also allows refreshing.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics({
        explicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      });
    const signedIn = await cognito.initiateAuth(
      signIn(clientId, simCognitoMetricPassword),
    );
    const refreshToken = signedIn.AuthenticationResult?.RefreshToken;

    assertNonNullable(refreshToken);

    // When the session is renewed from its refresh token.
    await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "REFRESH_TOKEN_AUTH",
        AuthParameters: { REFRESH_TOKEN: refreshToken },
      }),
    );

    // Then the refresh landed in its own metric, and the sign-in count still
    // reports the one sign-in, as real Cognito reports them.
    const refreshes = await simCognitoMetricDatapoint(
      simAws,
      "TokenRefreshSuccesses",
      userPoolId,
      clientId,
    );
    const signIns = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(refreshes);
    assertIdentical(refreshes.Sum, 1);
    assertNonNullable(signIns);
    assertIdentical(signIns.SampleCount, 1);
  });

  it("counts nothing for a pool nothing has asked to do anything", async () => {
    // Given a pool with a client and a user, and no requests made to it.
    const { simAws, userPoolId, clientId } = await simCognitoForMetrics();

    // Then the sign-in metric holds nothing at all, in place of a rate that
    // was never measured.
    assertUndefined(
      await simCognitoMetricDatapoint(
        simAws,
        "SignInSuccesses",
        userPoolId,
        clientId,
      ),
    );
  });
});
