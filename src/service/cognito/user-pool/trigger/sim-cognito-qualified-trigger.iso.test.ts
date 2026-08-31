import {
  CreateUserPoolClientCommand,
  CreateUserPoolCommand,
  SignUpCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  type SimLambdaAliasedFunction,
  simLambdaAliasedFunction,
  simLambdaAllowAliasInvoke,
} from "../../../../../test/lambda/alias-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simCognitoServicePrincipal } from "./sim-aws-cognito-trigger-functions.js";

/**
 * A pool whose PreSignUp trigger names a function ARN, and the client to sign
 * up through.
 */
interface SimCognitoAliasTriggerPool {
  readonly simAws: SimAws;
  readonly clientId: string;
  readonly trigger: SimLambdaAliasedFunction;
}

/**
 * Build a pool running a PreSignUp trigger against a qualified function ARN.
 *
 * The function is created before the pool, because a `LambdaConfig` names it by
 * ARN, and the permission after it, because that names the pool by ARN in turn.
 */
async function poolTriggering(
  triggerArn: (trigger: SimLambdaAliasedFunction) => string,
): Promise<SimCognitoAliasTriggerPool> {
  const simAws = new SimAws();
  const trigger = await simLambdaAliasedFunction(simAws, "auth-trigger", {
    result: (event) => event,
  });
  const cognito = simAws.cognitoIdentityProvider();
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      LambdaConfig: { PreSignUp: triggerArn(trigger) },
    }),
  );

  assertNonNullable(pool.UserPool?.Id, "CreateUserPool answered with a pool");
  assertNonNullable(pool.UserPool.Arn, "The created pool has an ARN");

  await simLambdaAllowAliasInvoke(
    simAws,
    "auth-trigger",
    simCognitoServicePrincipal,
    pool.UserPool.Arn,
  );

  const client = await cognito.createUserPoolClient(
    new CreateUserPoolClientCommand({
      UserPoolId: pool.UserPool.Id,
      ClientName: "web",
    }),
  );

  assertNonNullable(
    client.UserPoolClient?.ClientId,
    "CreateUserPoolClient answered with a client",
  );

  return { simAws, clientId: client.UserPoolClient.ClientId, trigger };
}

/**
 * Sign a user up through the pool, which is what fires the PreSignUp trigger.
 */
async function signUp(pool: SimCognitoAliasTriggerPool): Promise<void> {
  await pool.simAws.cognitoIdentityProvider().signUp(
    new SignUpCommand({
      ClientId: pool.clientId,
      Username: "alice",
      Password: "Sup3rSecret!",
    }),
  );
}

describe("A simulated Cognito user pool trigger naming a Lambda alias", () => {
  it("runs the version the alias points at", async () => {
    // Given a pool whose PreSignUp trigger names an alias admitting Cognito.
    const pool = await poolTriggering((trigger) => trigger.aliasArn);

    // When a user signs up.
    await signUp(pool);

    // Then the version behind the alias ran, rather than `$LATEST`.
    assertArrayEquals(pool.trigger.ranAs, [pool.trigger.version]);
  });

  it("refuses a qualifier naming no version or alias", async () => {
    // Given a pool whose trigger names an alias the function does not have.
    const pool = await poolTriggering(
      (trigger) => `${trigger.functionArn}:old`,
    );

    // When a user signs up.
    const error = await assertThrowsErrorAsync(async () => {
      await signUp(pool);
    });

    // Then the sign-up is refused rather than running `$LATEST`, and nothing
    // was invoked. The pool is created before the function's alias has to be
    // there, the same way it is created before the function itself, so this is
    // where a qualifier reaching nothing is found.
    assertStringIncludes(
      error.message,
      "names no simulated Lambda function version or alias",
    );
    assertArrayEmpty(pool.trigger.ranAs);
  });
});
