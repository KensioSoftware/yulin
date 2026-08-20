import {
  CreateUserPoolCommand,
  CreateUserPoolClientCommand,
  DescribeUserPoolCommand,
  InitiateAuthCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import type { CreateUserPoolCommandInput } from "@aws-sdk/client-cognito-identity-provider";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertStringIncludes,
  assertStringNotIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../sim-cognito-identity-provider.js";

/**
 * A policy a request could name that real Cognito refuses, with what the
 * refusal has to say about it.
 */
interface RefusedPolicy {
  readonly label: string;
  readonly factors: readonly string[];
  readonly says: string;
}

const refusedPolicies: readonly RefusedPolicy[] = [
  {
    label: "a factor Cognito does not have",
    factors: ["PASSWORD", "CARRIER_PIGEON"],
    says: "'CARRIER_PIGEON' is not a Cognito first authentication factor",
  },
  {
    label: "passkeys and nothing else",
    factors: ["WEB_AUTHN"],
    says: "WEB_AUTHN has to be accompanied by at least one other factor",
  },
  {
    label: "no factor at all",
    factors: [],
    says: "must name at least one factor",
  },
];

describe("sim Cognito sign-in policy", () => {
  function simCognito(): SimCognitoIdentityProvider {
    return new SimAws().cognitoIdentityProvider();
  }

  async function createdPoolId(
    cognito: SimCognitoIdentityProvider,
    input: Partial<CreateUserPoolCommandInput> = {},
  ): Promise<string> {
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users", ...input }),
    );
    const userPoolId = created.UserPool?.Id;
    assertTypeString(userPoolId);

    return userPoolId;
  }

  async function describedFactors(
    cognito: SimCognitoIdentityProvider,
    userPoolId: string,
  ): Promise<readonly string[] | undefined> {
    const described = await cognito.describeUserPool(
      new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
    );

    return described.UserPool?.Policies?.SignInPolicy?.AllowedFirstAuthFactors;
  }

  it("creates a pool that allows a password and a passkey", async () => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool is created with the policy AWS asks for under "Protect
    // other secrets", which is a password beside a passkey.
    const userPoolId = await createdPoolId(cognito, {
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
    });

    // Then the pool reports both back, in the order the request listed them.
    assertArrayEquals(await describedFactors(cognito, userPoolId), [
      "PASSWORD",
      "WEB_AUTHN",
    ]);
  });

  it("reports no policy for a pool that named none", async () => {
    // Given a pool created saying nothing about its first auth factors, which
    // signs its users in with a password.
    const cognito = simCognito();
    const userPoolId = await createdPoolId(cognito);

    // When it is described.
    // Then it reports no sign-in policy, as real Cognito reports one.
    assertUndefined(await describedFactors(cognito, userPoolId));
  });

  it("replaces the policy when the pool is updated", async () => {
    // Given a pool that allows passkeys.
    const cognito = simCognito();
    const userPoolId = await createdPoolId(cognito, {
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
    });

    // When an update names a password alone, as it would to turn passkeys
    // back off.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        Policies: { SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD"] } },
      }),
    );

    // Then the passkey has gone rather than the two being merged.
    assertArrayEquals(await describedFactors(cognito, userPoolId), [
      "PASSWORD",
    ]);
  });

  it.each(refusedPolicies)("refuses $label", async ({ factors, says }) => {
    // Given simulated Cognito.
    const cognito = simCognito();

    // When a pool is created with the policy. The SDK's own types allow none
    // of these, so the request is written the way it reaches the simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({
        input: {
          PoolName: "myapp-users",
          Policies: { SignInPolicy: { AllowedFirstAuthFactors: factors } },
        },
      });
    });

    // Then it is refused as an invalid parameter, saying what was wrong with
    // it, rather than a pool being created that signs nobody in.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, says);
  });

  /*
   * The guard on everything above. A pool that allows passkeys deploys and
   * describes itself, and nothing here can sign in with one. The refusal is on
   * the flow every factor beside a password is presented through, so it says
   * what could not be done rather than leaving a test to believe a passkey
   * sign-in ran.
   */
  it("goes on refusing the flow those factors are presented through", async () => {
    // Given a pool allowing passkeys, with a client that permits the flow.
    const cognito = simCognito();
    const userPoolId = await createdPoolId(cognito, {
      Policies: {
        SignInPolicy: { AllowedFirstAuthFactors: ["PASSWORD", "WEB_AUTHN"] },
      },
    });
    const client = await cognito.createUserPoolClient(
      new CreateUserPoolClientCommand({
        UserPoolId: userPoolId,
        ClientName: "web",
        ExplicitAuthFlows: ["ALLOW_USER_AUTH"],
      }),
    );

    // When a sign-in asks for choice-based authentication.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.initiateAuth(
        new InitiateAuthCommand({
          ClientId: client.UserPoolClient?.ClientId,
          AuthFlow: "USER_AUTH",
          AuthParameters: { USERNAME: "someone@example.com" },
        }),
      );
    });

    // Then it is refused naming the flow, and the pool's own policy is left
    // out of it.
    assertStringIncludes(error.message, "'USER_AUTH' is not simulated");
    assertStringIncludes(error.message, "choice-based sign-in");
    assertStringNotIncludes(error.message, "SignInPolicy");
  });
});
