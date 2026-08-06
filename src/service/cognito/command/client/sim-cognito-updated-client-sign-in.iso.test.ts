import {
  AdminInitiateAuthCommand,
  GlobalSignOutCommand,
  UpdateUserPoolClientCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import { simCognitoSignedInFactory } from "../../user-pool/auth/sim-cognito-signed-in.factory.js";

const password = "Correct-horse-1";

describe("signing in against an updated app client", () => {
  it("refuses an authentication flow the update took away", async () => {
    // Given a pool whose app client allows ADMIN_USER_PASSWORD_AUTH, and a
    // user who has signed in with it.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();
    const signedIn = await simCognitoSignedInFactory.make({ password }, simAws);

    // When an update leaves ALLOW_ADMIN_USER_PASSWORD_AUTH out, so the client
    // goes back to the flows CreateUserPoolClient defaults to.
    await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: signedIn.userPoolId,
        ClientId: signedIn.clientId,
        ClientName: "web",
      }),
    );

    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: signedIn.userPoolId,
          ClientId: signedIn.clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: signedIn.username, PASSWORD: password },
        }),
      );
    });

    // Then the next sign-in with that flow is refused.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "ADMIN_USER_PASSWORD_AUTH");
  });

  it("leaves a token already issued with the expiry it was issued with", async () => {
    // Given a user signed in on a stopped clock, against a client whose
    // access tokens last the default hour.
    const simAws = new SimAws();
    const cognito = simAws.cognitoIdentityProvider();

    await simAws.clock().setTo(new Date("2026-03-01T09:00:00.000Z"));

    const signedIn = await simCognitoSignedInFactory.make({ password }, simAws);

    // When the client's access tokens are shortened to five minutes.
    await cognito.updateUserPoolClient(
      new UpdateUserPoolClientCommand({
        UserPoolId: signedIn.userPoolId,
        ClientId: signedIn.clientId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_ADMIN_USER_PASSWORD_AUTH"],
        AccessTokenValidity: 5,
        TokenValidityUnits: { AccessToken: "minutes" },
      }),
    );

    // And ten minutes pass, which is longer than the new lifetime.
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then the token issued before the update is still honoured, because its
    // expiry was stamped when it was handed out rather than read from the
    // client later.
    await cognito.globalSignOut(
      new GlobalSignOutCommand({ AccessToken: signedIn.accessToken }),
    );

    // And the next sign-in gets the shorter lifetime.
    const signedInAgain = await cognito.adminInitiateAuth(
      new AdminInitiateAuthCommand({
        UserPoolId: signedIn.userPoolId,
        ClientId: signedIn.clientId,
        AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: signedIn.username, PASSWORD: password },
      }),
    );

    assertIdentical(signedInAgain.AuthenticationResult?.ExpiresIn, 5 * 60);
  });
});
