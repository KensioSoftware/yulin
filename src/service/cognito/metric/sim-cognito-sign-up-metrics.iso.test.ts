import {
  AdminCreateUserCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
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
} from "../../../../test/cognito/metric-fixture.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";

describe("AWS/Cognito sign-up and federation metrics", () => {
  it("counts a user that signed itself up", async () => {
    // Given a pool a user may sign itself up to.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics({ withUser: false });

    // When the user registers through the app client.
    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "bob",
        Password: simCognitoMetricPassword,
      }),
    );

    // Then the registration counted under the client it came through.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignUpSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(reading);
    assertIdentical(reading.Sum, 1);
    assertIdentical(reading.SampleCount, 1);
  });

  it("reports a user an administrator registered under a fixed name", async () => {
    // Given a pool an administrator will add a user to.
    const { simAws, cognito, userPoolId } = await simCognitoForMetrics({
      withUser: false,
    });

    // When the administrator creates the user.
    await cognito.adminCreateUser(
      new AdminCreateUserCommand({ UserPoolId: userPoolId, Username: "bob" }),
    );

    // Then it counted against `Admin`, because the request reached the pool
    // through no app client at all.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignUpSuccesses",
      userPoolId,
      "Admin",
    );

    assertNonNullable(reading);
    assertIdentical(reading.Sum, 1);
  });

  it("counts a refused registration as a request that succeeded none of the time", async () => {
    // Given a pool holding a user already.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoForMetrics({ withUser: false });

    await cognito.signUp(
      new SignUpCommand({
        ClientId: clientId,
        Username: "bob",
        Password: simCognitoMetricPassword,
      }),
    );

    // When a second registration takes the name the first one has.
    const taken = new SignUpCommand({
      ClientId: clientId,
      Username: "bob",
      Password: simCognitoMetricPassword,
    });

    await assertThrowsErrorAsync(async () => await cognito.signUp(taken));

    // Then both requests were counted, and only one of them succeeded.
    const reading = await simCognitoMetricDatapoint(
      simAws,
      "SignUpSuccesses",
      userPoolId,
      clientId,
    );

    assertNonNullable(reading);
    assertIdentical(reading.SampleCount, 2);
    assertIdentical(reading.Sum, 1);
  });

  it("counts a federated sign-in once it has issued tokens", async () => {
    // Given a pool with a hosted domain and a Google provider.
    const setUp = await simCognitoHosted();

    await setUp.simAws.clock().setTo(new Date("2026-08-30T09:00:00.000Z"));

    const code = await simCognitoAuthorizationCode(setUp);
    const http = new SimAwsHttp({ simAws: setUp.simAws });

    // When the application exchanges the provider's code for tokens.
    await http.fetch(`https://${setUp.domainHost}/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: setUp.clientId,
        code,
        redirect_uri: simCognitoCallbackUrl,
      }).toString(),
    });

    // Then the federation counted at the tokens rather than at the code, the
    // way real Cognito counts one.
    const reading = await simCognitoMetricDatapoint(
      setUp.simAws,
      "FederationSuccesses",
      setUp.userPoolId,
      setUp.clientId,
    );

    assertNonNullable(reading);
    assertIdentical(reading.Sum, 1);
    assertIdentical(reading.SampleCount, 1);
  });
});
