import {
  CreateUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  SetUserPoolMfaConfigCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertObjectEquals,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

/**
 * How a pool registers passkeys, which is the half of a passkey that is
 * configuration rather than a sign-in.
 *
 * Both values arrive through `SetUserPoolMfaConfig`, because that is where the
 * Cognito API takes them, and a pool records them and reports them back the
 * way it records its MFA configuration. Nothing here registers or presents a
 * passkey. Both go through the `USER_AUTH` flow, which is refused where a
 * sign-in asks for it, and `sim-cognito-sign-in-policy.iso.test.ts` is where
 * that refusal is covered.
 */
describe("sim Cognito user pool passkey registration", () => {
  async function poolWithMfa(): Promise<SimCognitoWithPool> {
    const cognito = new SimAws().cognitoIdentityProvider();
    const created = await cognito.createUserPool(
      new CreateUserPoolCommand({ PoolName: "myapp-users" }),
    );
    const userPoolId = created.UserPool?.Id;

    assertTypeString(userPoolId);

    return { cognito, userPoolId };
  }

  it("records how a passkey would be registered", async () => {
    // Given a pool. Nothing here registers or presents a passkey, and these
    // two values are what a passkey would mean rather than how a sign-in runs.
    const { cognito, userPoolId } = await poolWithMfa();

    // When the pool is configured for one.
    await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        WebAuthnConfiguration: {
          RelyingPartyId: "example.com",
          UserVerification: "required",
        },
      }),
    );

    // Then the pool reports it back, the way the deployed pool would.
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    assertObjectMatches(read.WebAuthnConfiguration, {
      RelyingPartyId: "example.com",
      UserVerification: "required",
    });
  });

  it("records a relying party ID on its own", async () => {
    // Given a pool. Cognito defaults the user verification preference, and a
    // template that names only the relying party ID is what a CDK `UserPool`
    // with `passkeyRelyingPartyId` and no `passkeyUserVerification` emits.
    const { cognito, userPoolId } = await poolWithMfa();

    // When it is configured with that one value.
    await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        WebAuthnConfiguration: { RelyingPartyId: "example.com" },
      }),
    );

    // Then the pool reports the ID, and no preference it was never given.
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    assertObjectEquals(read.WebAuthnConfiguration, {
      RelyingPartyId: "example.com",
    });
  });

  it("refuses a user verification preference Cognito does not have", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await poolWithMfa();

    // When it is configured to register passkeys under a preference that is
    // neither of the two Cognito accepts. The SDK's own types disallow it, so
    // the request is written the way it reaches the simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.setUserPoolMfaConfig({
        input: {
          UserPoolId: userPoolId,
          MfaConfiguration: "OPTIONAL",
          WebAuthnConfiguration: { UserVerification: "whenever" },
        },
      });
    });

    // Then it is refused naming the two.
    assertStringIncludes(error.message, "UserVerification 'whenever'");
    assertStringIncludes(error.message, "required or preferred");
  });
});
