import {
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type {
  ExplicitAuthFlowsType,
  PreventUserExistenceErrorTypes,
} from "@aws-sdk/client-cognito-identity-provider";
import { CreateRoleCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimCognitoInvalidParameterException,
  SimCognitoNotAuthorizedException,
  SimCognitoResourceNotFoundException,
  SimCognitoUserNotFoundException,
} from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const password = "Sup3rSecret!";

interface SimCognitoWithClient {
  readonly simAws: SimAws;
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
  readonly clientId: string;
}

/**
 * A pool with a client-side app client, and a user with a temporary password.
 */
async function simCognitoWithClient(
  authFlows: ExplicitAuthFlowsType[] = ["ALLOW_USER_PASSWORD_AUTH"],
  preventUserExistenceErrors?: PreventUserExistenceErrorTypes,
): Promise<SimCognitoWithClient> {
  const simAws = new SimAws();
  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({ PoolName: "myapp-users" }),
  );

  assertNonNullable(pool.UserPool?.Id);

  const userPoolId = pool.UserPool.Id;
  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: userPoolId,
      ClientName: "web",
      ExplicitAuthFlows: authFlows,
      PreventUserExistenceErrors: preventUserExistenceErrors,
    }),
  );

  assertNonNullable(client.UserPoolClient?.ClientId);

  await cognito.adminCreateUser(
    new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      TemporaryPassword: "Temp0rary!",
    }),
  );

  return {
    simAws,
    cognito,
    userPoolId,
    clientId: client.UserPoolClient.ClientId,
  };
}

/**
 * Give the user a password of its own, which confirms it.
 */
async function confirmAlice(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<void> {
  await cognito.adminSetUserPassword(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: "alice",
      Password: password,
      Permanent: true,
    }),
  );
}

function signIn(clientId: string, username = "alice"): InitiateAuthCommand {
  return new InitiateAuthCommand({
    ClientId: clientId,
    AuthFlow: "USER_PASSWORD_AUTH",
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });
}

describe("sim Cognito InitiateAuth", () => {
  it("answers a confirmed user with the same tokens the admin flow gives", async () => {
    // Given a confirmed user, and an app client that allows client-side
    // sign-in.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient();

    await confirmAlice(cognito, userPoolId);

    // When it signs in without naming the pool.
    const signedIn = await cognito.initiateAuth(signIn(clientId));

    // Then the tokens come back, refresh token included.
    const result = signedIn.AuthenticationResult;

    assertNonNullable(result?.AccessToken);
    assertNonNullable(result.IdToken);
    assertNonNullable(result.RefreshToken);
    assertIdentical(result.ExpiresIn, 3600);
    assertIdentical(result.TokenType, "Bearer");
    assertUndefined(signedIn.ChallengeName);
  });

  it("needs no IAM permission, where the admin flow does", async () => {
    // Given a confirmed user, and a caller whose Role permits nothing at all.
    const { simAws, cognito, userPoolId, clientId } =
      await simCognitoWithClient([
        "ALLOW_USER_PASSWORD_AUTH",
        "ALLOW_ADMIN_USER_PASSWORD_AUTH",
      ]);

    await confirmAlice(cognito, userPoolId);

    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "AppClient",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: "arn:aws:iam::123456789012:root" },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const caller: SimAwsCaller = { kind: "arn", arn: role.Role.Arn };

    // When that caller signs in through the admin flow.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.adminInitiateAuth(
        new AdminInitiateAuthCommand({
          UserPoolId: userPoolId,
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
        }),
        { caller },
      );
    });

    // Then it is denied, and the same sign-in through InitiateAuth is not,
    // because real Cognito evaluates no IAM policy for that operation.
    assertInstanceOf(error, SimIamAccessDenied);

    const signedIn = await cognito.initiateAuth(signIn(clientId));

    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses a client the app client is not configured for", async () => {
    // Given an app client without ALLOW_USER_PASSWORD_AUTH.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient([
      "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    ]);

    await confirmAlice(cognito, userPoolId);

    // When a client-side sign-in is tried anyway.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(signIn(clientId));
    });

    // Then it is refused before the password is looked at, as real Cognito
    // refuses it.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(
      error.message,
      "USER_PASSWORD_AUTH is not enabled for the client",
    );
  });

  it("takes the legacy ExplicitAuthFlows value the setting replaced", async () => {
    // Given an app client created with the legacy flow value.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient([
      "USER_PASSWORD_AUTH",
    ]);

    await confirmAlice(cognito, userPoolId);

    // When the user signs in.
    const signedIn = await cognito.initiateAuth(signIn(clientId));

    // Then it works, as it does on a real pool whose client predates the
    // ALLOW_ prefixed settings.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses the admin flow, which is not valid for InitiateAuth", async () => {
    // Given an app client that allows the admin flow.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient([
      "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    ]);

    await confirmAlice(cognito, userPoolId);

    // When it is asked for through the client-side operation.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "ADMIN_USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
        }),
      );
    });

    // Then it is refused: ADMIN_USER_PASSWORD_AUTH is a flow of
    // AdminInitiateAuth alone.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "is not simulated");
  });

  it("challenges a user that has to change its password", async () => {
    // Given a user an admin created, still in FORCE_CHANGE_PASSWORD.
    const { cognito, clientId } = await simCognitoWithClient();

    // When it signs in with its temporary password.
    const signedIn = await cognito.initiateAuth(
      new InitiateAuthCommand({
        ClientId: clientId,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: { USERNAME: "alice", PASSWORD: "Temp0rary!" },
      }),
    );

    // Then it gets the challenge and a session rather than tokens.
    assertIdentical(signedIn.ChallengeName, "NEW_PASSWORD_REQUIRED");
    assertNonNullable(signedIn.Session);
    assertUndefined(signedIn.AuthenticationResult);
  });

  it("refuses an app client id no pool in the scope issued", async () => {
    // Given a pool with an app client.
    const { cognito } = await simCognitoWithClient();

    // When a sign-in names a client id from nowhere.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(signIn("bqhvv5r1t7bnn0ok26q52i5oqz"));
    });

    // Then the client is reported missing: the client id is all there is to
    // find the pool with.
    assertInstanceOf(error, SimCognitoResourceNotFoundException);
    assertStringIncludes(error.message, "does not exist");
  });

  it("reports a user the pool does not hold, on the LEGACY default", async () => {
    // Given an app client left on the PreventUserExistenceErrors default.
    const { cognito, clientId } = await simCognitoWithClient();

    // When an unknown user signs in.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(signIn(clientId, "nobody"));
    });

    // Then the pool says the user does not exist, as a LEGACY client does.
    assertInstanceOf(error, SimCognitoUserNotFoundException);
  });

  it("hides a user the pool does not hold, when the client says to", async () => {
    // Given an app client with PreventUserExistenceErrors of ENABLED.
    const { cognito, clientId } = await simCognitoWithClient(
      ["ALLOW_USER_PASSWORD_AUTH"],
      "ENABLED",
    );

    // When an unknown user signs in.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(signIn(clientId, "nobody"));
    });

    // Then it is refused the way a wrong password is, saying nothing about
    // whether the user is there.
    assertInstanceOf(error, SimCognitoNotAuthorizedException);
    assertStringIncludes(error.message, "Incorrect username or password");
  });

  it("signs a user in through a client that hides user existence", async () => {
    // Given an app client with PreventUserExistenceErrors of ENABLED, and a
    // confirmed user.
    const { cognito, userPoolId, clientId } = await simCognitoWithClient(
      ["ALLOW_USER_PASSWORD_AUTH"],
      "ENABLED",
    );

    await confirmAlice(cognito, userPoolId);

    // When it signs in.
    const signedIn = await cognito.initiateAuth(signIn(clientId));

    // Then the setting changes only what a failure says, not whether a user
    // that is there can sign in.
    assertNonNullable(signedIn.AuthenticationResult?.AccessToken);
  });

  it("refuses an InitiateAuth input this simulation cannot honour", async () => {
    // Given a pool with an app client.
    const { cognito, clientId } = await simCognitoWithClient();

    // When a sign-in carries threat protection context data.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: clientId,
          AuthFlow: "USER_PASSWORD_AUTH",
          AuthParameters: { USERNAME: "alice", PASSWORD: password },
          UserContextData: { IpAddress: "192.0.2.1" },
        }),
      );
    });

    // Then it is refused rather than signed in as if the data had not been
    // sent.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "UserContextData is not simulated");
  });
});
