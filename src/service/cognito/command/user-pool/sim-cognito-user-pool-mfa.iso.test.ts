import type { UserPoolMfaType } from "@aws-sdk/client-cognito-identity-provider";
import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  GetUserPoolMfaConfigCommand,
  SetUserPoolMfaConfigCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
  assertUndefined,
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
 * A pool created with the MFA configuration the test is about.
 */
async function poolWithMfa(
  mfaConfiguration?: UserPoolMfaType,
): Promise<SimCognitoWithPool> {
  const cognito = new SimAws().cognitoIdentityProvider();
  const created = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      ...(mfaConfiguration !== undefined && {
        MfaConfiguration: mfaConfiguration,
      }),
    }),
  );
  const userPoolId = created.UserPool?.Id;

  assertTypeString(userPoolId);

  return { cognito, userPoolId };
}

async function describedMfa(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<string | undefined> {
  const described = await cognito.describeUserPool(
    new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
  );

  return described.UserPool?.MfaConfiguration;
}

describe("sim Cognito user pool MFA configuration", () => {
  it("creates a pool that offers MFA and reports the setting back", async () => {
    // Given a pool created with optional MFA, which is an ordinary thing for a
    // stack to declare.
    const { cognito, userPoolId } = await poolWithMfa("OPTIONAL");

    // When the pool is described.
    const reported = await describedMfa(cognito, userPoolId);

    // Then it reports what the request asked for rather than OFF.
    assertIdentical(reported, "OPTIONAL");
  });

  it("creates a pool that requires MFA and reports the setting back", async () => {
    // Given a pool created with MFA required of every user.
    const { cognito, userPoolId } = await poolWithMfa("ON");

    // When the pool is described.
    const reported = await describedMfa(cognito, userPoolId);

    // Then that is what it reports.
    assertIdentical(reported, "ON");
  });

  it("creates a pool that says nothing about MFA with it off", async () => {
    // Given a pool created without an MfaConfiguration.
    const { cognito, userPoolId } = await poolWithMfa();

    // When the pool is described.
    const reported = await describedMfa(cognito, userPoolId);

    // Then it is off, which is the default real Cognito applies.
    assertIdentical(reported, "OFF");
  });

  it("refuses an MfaConfiguration Cognito does not have", async () => {
    // Given simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool asks for MFA in a word Cognito does not use.
    // The SDK's own types allow only Cognito's three values, so this is the
    // request as it reaches the simulator.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.createUserPool({
        input: { PoolName: "myapp-users", MfaConfiguration: "REQUIRED" },
      });
    });

    // Then it is refused, naming the values it could have used.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "use OFF, OPTIONAL or ON");
  });

  it("sets the factors behind a pool's MFA and reports them back", async () => {
    // Given a pool with MFA on offer.
    const { cognito, userPoolId } = await poolWithMfa();

    // When it is configured for a time-based one-time password, which is the
    // second call CloudFormation makes for a pool declaring MFA.
    const set = await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        SoftwareTokenMfaConfiguration: { Enabled: true },
      }),
    );

    // Then the call answers with the configuration the pool now has, and both
    // GetUserPoolMfaConfig and DescribeUserPool report it.
    assertIdentical(set.MfaConfiguration, "OPTIONAL");
    assertTrue(set.SoftwareTokenMfaConfiguration?.Enabled);

    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    assertIdentical(read.MfaConfiguration, "OPTIONAL");
    assertTrue(read.SoftwareTokenMfaConfiguration?.Enabled);
    assertIdentical(await describedMfa(cognito, userPoolId), "OPTIONAL");
  });

  it("reports no factors for a pool nothing has configured", async () => {
    // Given a pool no SetUserPoolMfaConfig request has reached.
    const { cognito, userPoolId } = await poolWithMfa("OPTIONAL");

    // When its MFA configuration is read.
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    // Then it reports the setting it was created with and no factor at all,
    // rather than a factor that was never asked about.
    assertIdentical(read.MfaConfiguration, "OPTIONAL");
    assertUndefined(read.SoftwareTokenMfaConfiguration);
  });

  it("reads a factor named without an Enabled as disabled", async () => {
    // Given a pool.
    const { cognito, userPoolId } = await poolWithMfa();

    // When a request names the factor and says nothing about enabling it.
    await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        SoftwareTokenMfaConfiguration: {},
      }),
    );

    // Then it is disabled, as real Cognito reads one.
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    assertFalse(read.SoftwareTokenMfaConfiguration?.Enabled);
  });

  it("keeps a pool's factors through an update that says nothing about them", async () => {
    // Given a pool configured for a time-based one-time password.
    const { cognito, userPoolId } = await poolWithMfa();

    await cognito.setUserPoolMfaConfig(
      new SetUserPoolMfaConfigCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "OPTIONAL",
        SoftwareTokenMfaConfiguration: { Enabled: true },
      }),
    );

    // When an update changes whether the pool challenges. An UpdateUserPool
    // request carries no factor configuration at all.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        MfaConfiguration: "ON",
      }),
    );

    // Then the challenging changes and the factor behind it is left alone.
    const read = await cognito.getUserPoolMfaConfig(
      new GetUserPoolMfaConfigCommand({ UserPoolId: userPoolId }),
    );

    assertIdentical(read.MfaConfiguration, "ON");
    assertTrue(read.SoftwareTokenMfaConfiguration?.Enabled);
  });

  it("turns MFA off for an update that leaves the setting out", async () => {
    // Given a pool created with optional MFA.
    const { cognito, userPoolId } = await poolWithMfa("OPTIONAL");

    // When an update names no MfaConfiguration. An update replaces a pool's
    // settings rather than merging into them, here and on real Cognito.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        DeletionProtection: "INACTIVE",
      }),
    );

    // Then the pool goes back to the default a creation would have given it.
    assertIdentical(await describedMfa(cognito, userPoolId), "OFF");
  });

  it("refuses the second factors it could not deliver a message for", async () => {
    // Given a pool. No pool here has an SmsConfiguration or an
    // EmailConfiguration, because CreateUserPool refuses both.
    const { cognito, userPoolId } = await poolWithMfa();

    // When a factor needing one of them is asked for.
    const sms = await assertThrowsErrorAsync(async () => {
      await cognito.setUserPoolMfaConfig(
        new SetUserPoolMfaConfigCommand({
          UserPoolId: userPoolId,
          MfaConfiguration: "OPTIONAL",
          SmsMfaConfiguration: { SmsAuthenticationMessage: "{####}" },
        }),
      );
    });
    const email = await assertThrowsErrorAsync(async () => {
      await cognito.setUserPoolMfaConfig(
        new SetUserPoolMfaConfigCommand({
          UserPoolId: userPoolId,
          MfaConfiguration: "OPTIONAL",
          EmailMfaConfiguration: { Subject: "Your code" },
        }),
      );
    });

    // Then both are refused, saying what the pool would have needed.
    assertStringIncludes(sms.message, "a second factor sent by SMS");
    assertStringIncludes(sms.message, "SmsConfiguration");
    assertStringIncludes(email.message, "a second factor sent by email");
    assertStringIncludes(email.message, "EmailConfiguration");
  });

  it("refuses a passkey, which no flow here would ask for", async () => {
    // Given a pool. A passkey is presented through the USER_AUTH flow, which
    // this simulation refuses as a flow of its own.
    const { cognito, userPoolId } = await poolWithMfa();

    // When the pool is configured for one.
    const error = await assertThrowsErrorAsync(async () => {
      await cognito.setUserPoolMfaConfig(
        new SetUserPoolMfaConfigCommand({
          UserPoolId: userPoolId,
          MfaConfiguration: "OPTIONAL",
          WebAuthnConfiguration: { RelyingPartyId: "example.com" },
        }),
      );
    });

    // Then it is refused rather than accepted and never asked for.
    assertStringIncludes(error.message, "signing in with a passkey");
  });

  it("refuses a request naming no pool", async () => {
    // Given simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When the MFA configuration of no pool in particular is set and read.
    const set = await assertThrowsErrorAsync(async () => {
      await cognito.setUserPoolMfaConfig({ input: {} });
    });
    const read = await assertThrowsErrorAsync(async () => {
      await cognito.getUserPoolMfaConfig({ input: {} });
    });

    // Then both fail as validation errors.
    assertInstanceOf(set, SimCognitoInvalidParameterException);
    assertStringIncludes(set.message, "UserPoolId is required");
    assertInstanceOf(read, SimCognitoInvalidParameterException);
    assertStringIncludes(read.message, "UserPoolId is required");
  });
});
