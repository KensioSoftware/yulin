import {
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
} from "@aws-sdk/client-cloudwatch";
import {
  InitiateAuthCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  simCognitoAuthorizationCode,
  simCognitoCallbackUrl,
  simCognitoHosted,
} from "../../../../test/cognito/federation-fixture.js";
import {
  simCognitoForMetrics,
  simCognitoMetricDatapoint,
  simCognitoMetricPassword,
  simCognitoMetricUser,
} from "../../../../test/cognito/metric-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimCognitoTooManyRequestsException } from "../error/sim-cognito-throttle.error.js";

function signIn(clientId: string): InitiateAuthCommand {
  return new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: {
      USERNAME: simCognitoMetricUser,
      PASSWORD: simCognitoMetricPassword,
    },
  });
}

describe("AWS/Cognito throttle metrics a simulated user pool publishes", () => {
  it("turns a sign-in away once it has been told to", async () => {
    // Given a pool told to turn the next sign-in away.
    const { cognito, userPoolId, clientId } = await simCognitoForMetrics();

    cognito.userPool(userPoolId).auth.throttle.signIns(1);

    // When the user signs in with the right password.
    const error = await assertThrowsErrorAsync(
      async () => await cognito.initiateAuth(signIn(clientId)),
    );

    // Then the pool answered the way real Cognito answers a rate limit,
    // rather than letting the sign-in through.
    assertInstanceOf(error, SimCognitoTooManyRequestsException);
    assertIdentical(error.name, "TooManyRequestsException");
  });

  it("counts a throttled sign-in in both places", async () => {
    // Given a pool told to turn the next sign-in away.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics();

    cognito.userPool(userPoolId).auth.throttle.signIns(1);

    // When a sign-in is turned away.
    await assertThrowsErrorAsync(
      async () => await cognito.initiateAuth(signIn(clientId)),
    );

    // Then it counted as a throttle, and as an authentication request that
    // issued no tokens, which is how real Cognito counts one.
    const throttles = await simCognitoMetricDatapoint(
      simAws,
      "SignInThrottles",
      userPoolId,
      clientId,
    );
    const successes = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(throttles);
    assertIdentical(throttles.Sum, 1);
    assertNonNullable(successes);
    assertIdentical(successes.SampleCount, 1);
    assertIdentical(successes.Sum, 0);
  });

  it("turns away only as many requests as it was told to", async () => {
    // Given a pool told to turn the next two sign-ins away.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics();

    cognito.userPool(userPoolId).auth.throttle.signIns(2);

    // When three sign-ins are made.
    await assertThrowsErrorAsync(
      async () => await cognito.initiateAuth(signIn(clientId)),
    );
    await assertThrowsErrorAsync(
      async () => await cognito.initiateAuth(signIn(clientId)),
    );

    const signedIn = await cognito.initiateAuth(signIn(clientId));

    // Then the third one went through, and only the first two were counted as
    // throttles.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);

    const throttles = await simCognitoMetricDatapoint(
      simAws,
      "SignInThrottles",
      userPoolId,
      clientId,
    );

    assertNonNullable(throttles);
    assertIdentical(throttles.Sum, 2);
  });

  it("counts a registration the pool turned away", async () => {
    // Given a pool told to turn the next registration away.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics({ withUser: false });

    cognito.userPool(userPoolId).auth.throttle.signUps(1);

    // When a user tries to register.
    await assertThrowsErrorAsync(
      async () =>
        await cognito.signUp(
          new SignUpCommand({
            ClientId: clientId,
            Username: "bob",
            Password: simCognitoMetricPassword,
          }),
        ),
    );

    // Then the registration counted under its own throttle metric.
    const throttles = await simCognitoMetricDatapoint(
      simAws,
      "SignUpThrottles",
      userPoolId,
      clientId,
    );

    assertNonNullable(throttles);
    assertIdentical(throttles.Sum, 1);
  });

  it("counts a renewal the pool turned away", async () => {
    // Given a signed-in user and a pool told to turn the next renewal away.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics({
        explicitAuthFlows: [
          "ALLOW_USER_PASSWORD_AUTH",
          "ALLOW_REFRESH_TOKEN_AUTH",
        ],
      });
    const signedIn = await cognito.initiateAuth(signIn(clientId));
    const refreshToken = signedIn.AuthenticationResult?.RefreshToken;

    assertNonNullable(refreshToken);

    cognito.userPool(userPoolId).auth.throttle.tokenRefreshes(1);

    // When the session is renewed.
    await assertThrowsErrorAsync(
      async () =>
        await cognito.initiateAuth(
          new InitiateAuthCommand({
            ClientId: clientId,
            AuthFlow: "REFRESH_TOKEN_AUTH",
            AuthParameters: { REFRESH_TOKEN: refreshToken },
          }),
        ),
    );

    // Then the renewal counted as a token refresh throttle, and the sign-in
    // that came before it is still the only sign-in counted.
    const throttles = await simCognitoMetricDatapoint(
      simAws,
      "TokenRefreshThrottles",
      userPoolId,
      clientId,
    );
    const signIns = await simCognitoMetricDatapoint(
      simAws,
      "SignInSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(throttles);
    assertIdentical(throttles.Sum, 1);
    assertNonNullable(signIns);
    assertIdentical(signIns.SampleCount, 1);
  });

  it("drives an alarm on a pool's throttling to ALARM", async () => {
    // Given an alarm watching the sign-ins a pool turns away.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics();

    await simAws.cloudWatch().putMetricAlarm(
      new PutMetricAlarmCommand({
        AlarmName: "SignInsThrottling",
        Namespace: "AWS/Cognito",
        MetricName: "SignInThrottles",
        Dimensions: [
          { Name: "UserPool", Value: userPoolId },
          { Name: "UserPoolClient", Value: clientId },
        ],
        Statistic: "Sum",
        Period: 300,
        EvaluationPeriods: 3,
        DatapointsToAlarm: 1,
        Threshold: 0,
        ComparisonOperator: "GreaterThanThreshold",
        TreatMissingData: "notBreaching",
      }),
    );

    // When the pool turns a sign-in away and the clock passes the period.
    cognito.userPool(userPoolId).auth.throttle.signIns(1);
    await assertThrowsErrorAsync(
      async () => await cognito.initiateAuth(signIn(clientId)),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 6 });

    // Then the alarm went off, driven by the pool rather than by a datapoint
    // a test stood up on its behalf.
    const described = new DescribeAlarmsCommand({
      AlarmNames: ["SignInsThrottling"],
    });
    const { MetricAlarms } = await simAws
      .cloudWatch()
      .describeAlarms(described);

    assertIdentical(MetricAlarms?.at(0)?.StateValue, "ALARM");
  });

  it("counts a federated sign-in the pool turned away", async () => {
    // Given a hosted pool told to turn the next federation away.
    const setUp = await simCognitoHosted();

    await setUp.simAws.clock().setTo(new Date("2026-08-30T09:00:00.000Z"));

    const code = await simCognitoAuthorizationCode(setUp);

    setUp.cognito.userPool(setUp.userPoolId).auth.throttle.federations(1);

    // When the application exchanges the provider's code for tokens.
    const http = new SimAwsHttp({ simAws: setUp.simAws });
    const exchange = await http.fetch(
      `https://${setUp.domainHost}/oauth2/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: setUp.clientId,
          code,
          redirect_uri: simCognitoCallbackUrl,
        }).toString(),
      },
    );

    // Then the endpoint refused it and the pool counted the federation it
    // turned away.
    assertFalse(exchange.ok);

    const throttles = await simCognitoMetricDatapoint(
      setUp.simAws,
      "FederationThrottles",
      setUp.userPoolId,
      setUp.clientId,
    );

    assertNonNullable(throttles);
    assertIdentical(throttles.Sum, 1);
  });

  it("turns nothing away until a test asks it to", async () => {
    // Given a pool nothing has told to turn anything away.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics();

    // When the user signs in.
    const signedIn = await cognito.initiateAuth(signIn(clientId));

    // Then it went through, and the pool counted no throttle at all.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
    assertUndefined(
      await simCognitoMetricDatapoint(
        simAws,
        "SignInThrottles",
        userPoolId,
        clientId,
      ),
    );
  });
});
