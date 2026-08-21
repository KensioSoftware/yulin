import {
  CreateUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  SetUserPoolMfaConfigCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertInstanceOf,
  assertObjectEquals,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

interface SimCognitoWithPool {
  readonly cognito: SimCognitoIdentityProvider;
  readonly userPoolId: string;
}

/**
 * A relying party ID a request could name that real Cognito refuses. It takes
 * a domain of between one and 127 characters.
 */
interface RefusedRelyingParty {
  readonly label: string;
  readonly relyingPartyId: string;
}

const longestRelyingPartyId = `${"a".repeat(123)}.com`;

const refusedRelyingParties: readonly RefusedRelyingParty[] = [
  { label: "no relying party at all", relyingPartyId: "" },
  {
    label: "a relying party longer than Cognito takes",
    relyingPartyId: `a${longestRelyingPartyId}`,
  },
];

/**
 * How a pool registers passkeys, which is the half of a passkey that is
 * configuration rather than a sign-in.
 *
 * Both values arrive through `SetUserPoolMfaConfig`, because that is where the
 * Cognito API takes them, and a pool records them and reports them back the
 * way it records its MFA configuration. Registering a passkey against them is
 * covered in `sim-cognito-web-authn-registration.iso.test.ts`.
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
    // Given a pool. These two values are what a passkey means rather than how
    // a sign-in runs, and both arrive before either is registered.
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

  it("records the longest relying party ID Cognito takes", async () => {
    // Given a pool. 127 characters is the limit, so the domain of exactly that
    // length is the one either side of the limit has to be told apart from.
    const { cognito, userPoolId } = await poolWithMfa();

    // When it is configured with that domain.
    await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        WebAuthnConfiguration: { RelyingPartyId: longestRelyingPartyId },
      }),
    );

    // Then the pool records it rather than refusing it.
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    assertObjectEquals(read.WebAuthnConfiguration, {
      RelyingPartyId: longestRelyingPartyId,
    });
  });

  it.each(refusedRelyingParties)(
    "refuses $label",
    async ({ relyingPartyId }) => {
      // Given a pool.
      const { cognito, userPoolId } = await poolWithMfa();

      // When it is configured to register passkeys against that domain, which
      // is no domain a passkey provider could trust.
      const error = await assertThrowsErrorAsync(async () => {
        await cognito.setUserPoolMfaConfig(
          new SetUserPoolMfaConfigCommand({
            UserPoolId: userPoolId,
            MfaConfiguration: "OPTIONAL",
            WebAuthnConfiguration: { RelyingPartyId: relyingPartyId },
          }),
        );
      });

      // Then it is refused as an invalid parameter, saying what a relying
      // party ID has to be.
      assertInstanceOf(error, SimCognitoInvalidParameterException);
      assertStringIncludes(
        error.message,
        "RelyingPartyId must be between 1 and 127 characters long",
      );
    },
  );

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
