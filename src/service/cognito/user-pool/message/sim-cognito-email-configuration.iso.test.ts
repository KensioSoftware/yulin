import {
  CreateUserPoolCommand,
  DescribeUserPoolCommand,
  UpdateUserPoolCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCognitoInvalidParameterException } from "../../error/sim-cognito.error.js";
import type { SimCognitoEmailConfigurationType } from "./sim-cognito-email-configuration.js";
import type { SimCognitoIdentityProvider } from "../../sim-cognito-identity-provider.js";

const sesArn = "arn:aws:ses:eu-west-2:111122223333:identity/example.com";

/**
 * The configuration as a template or a hand-written request may carry it,
 * rather than as the SDK types it. A value the SDK's union rules out is
 * exactly what some of these tests send.
 */
type DeclaredEmailConfiguration = Readonly<Record<string, string>>;

async function createPool(
  cognito: SimCognitoIdentityProvider,
  emailConfiguration?: DeclaredEmailConfiguration,
): Promise<string> {
  const pool = await cognito.createUserPool(
    new CreateUserPoolCommand({
      PoolName: "myapp-users",
      EmailConfiguration: emailConfiguration,
    }),
  );

  assertNonNullable(pool.UserPool?.Id);

  return pool.UserPool.Id;
}

async function describedEmail(
  cognito: SimCognitoIdentityProvider,
  userPoolId: string,
): Promise<SimCognitoEmailConfigurationType | undefined> {
  const described = await cognito.describeUserPool(
    new DescribeUserPoolCommand({ UserPoolId: userPoolId }),
  );

  return described.UserPool?.EmailConfiguration;
}

describe("sim Cognito user pool email configuration", () => {
  it("reports back the configuration the pool was created with", async () => {
    // Given a pool created with a full SES email configuration.
    const cognito = new SimAws().cognitoIdentityProvider();
    const declared = {
      EmailSendingAccount: "DEVELOPER",
      From: "Example <no-reply@example.com>",
      SourceArn: sesArn,
      ReplyToEmailAddress: "support@example.com",
      ConfigurationSet: "transactional",
    } as const;

    // When the pool is described.
    const userPoolId = await createPool(cognito, declared);
    const reported = await describedEmail(cognito, userPoolId);

    // Then it answers with the configuration as the request set it.
    assertNonNullable(reported);
    assertIdentical(reported.EmailSendingAccount, "DEVELOPER");
    assertIdentical(reported.From, "Example <no-reply@example.com>");
    assertIdentical(reported.SourceArn, sesArn);
    assertIdentical(reported.ReplyToEmailAddress, "support@example.com");
    assertIdentical(reported.ConfigurationSet, "transactional");
  });

  it("reports no configuration for a pool created without one", async () => {
    // Given a pool created with no email configuration at all.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When it is described.
    const reported = await describedEmail(cognito, await createPool(cognito));

    // Then it answers with none, rather than with the defaults behind it, as
    // real Cognito answers.
    assertUndefined(reported);
  });

  it("moves a pool onto SES with UpdateUserPool", async () => {
    // Given a pool sending through Cognito's own email.
    const cognito = new SimAws().cognitoIdentityProvider();
    const userPoolId = await createPool(cognito);

    // When it is updated onto SES.
    await cognito.updateUserPool(
      new UpdateUserPoolCommand({
        UserPoolId: userPoolId,
        EmailConfiguration: {
          EmailSendingAccount: "DEVELOPER",
          From: "no-reply@example.com",
          SourceArn: sesArn,
        },
      }),
    );

    // Then the pool reports the configuration it was moved to.
    const reported = await describedEmail(cognito, userPoolId);
    assertNonNullable(reported);
    assertIdentical(reported.EmailSendingAccount, "DEVELOPER");
  });

  it("refuses a DEVELOPER pool that names no identity to send as", async () => {
    // Given a simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool asks to send through SES without a SourceArn.
    const error = await assertThrowsErrorAsync(async () => {
      await createPool(cognito, { EmailSendingAccount: "DEVELOPER" });
    });

    // Then it is refused, saying what the pool would send as.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "CreateUserPool");
    assertStringIncludes(error.message, "SourceArn");
  });

  it("refuses a domain SourceArn with no From to send as", async () => {
    // Given a simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool sends through a verified domain and names no From address.
    const error = await assertThrowsErrorAsync(async () => {
      await createPool(cognito, {
        EmailSendingAccount: "DEVELOPER",
        SourceArn: sesArn,
      });
    });

    // Then it is refused, as real Cognito refuses it: a domain identity gives
    // Cognito no one address to write as.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "example.com");
    assertStringIncludes(error.message, "needs a From address");
  });

  it("takes an address SourceArn with no From, which names one to send as", async () => {
    // Given a simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool sends through a verified address and names no From.
    const userPoolId = await createPool(cognito, {
      EmailSendingAccount: "DEVELOPER",
      SourceArn:
        "arn:aws:ses:eu-west-2:111122223333:identity/hello@example.com",
    });

    // Then the pool is created, because the identity is the address.
    const reported = await describedEmail(cognito, userPoolId);
    assertNonNullable(reported);
    assertUndefined(reported.From);
  });

  it("refuses a SourceArn whose account is not an account id", async () => {
    // Given a simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool names an ARN with nothing where the account belongs.
    const error = await assertThrowsErrorAsync(async () => {
      await createPool(cognito, {
        EmailSendingAccount: "DEVELOPER",
        From: "no-reply@example.com",
        SourceArn: "arn:aws:ses:eu-west-2::identity/example.com",
      });
    });

    // Then it is refused as malformed, even though the account is read past
    // when the ARN is well formed.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "SES email identity");
  });

  it("refuses a SourceArn that names something other than an identity", async () => {
    // Given a simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool points its SourceArn at an SES configuration set.
    const error = await assertThrowsErrorAsync(async () => {
      await createPool(cognito, {
        EmailSendingAccount: "DEVELOPER",
        SourceArn: "arn:aws:ses:eu-west-2:111122223333:configuration-set/main",
      });
    });

    // Then it is refused by naming the value, rather than being read as an
    // identity called `configuration-set/main`.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "configuration-set/main");
    assertStringIncludes(error.message, "SES email identity");
  });

  it("refuses a key a template wrote as something other than a string", async () => {
    // Given a simulated Cognito, and a template that wrote the From as a
    // number, which the CloudFormation path hands over as written.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When such a pool is created.
    const error = await assertThrowsErrorAsync(async () => {
      await createPool(cognito, {
        From: 42,
      } as unknown as DeclaredEmailConfiguration);
    });

    // Then it is refused by naming the key.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "From must be a string");
  });

  it("refuses a sending account Cognito has no meaning for", async () => {
    // Given a simulated Cognito.
    const cognito = new SimAws().cognitoIdentityProvider();

    // When a pool asks to send through something else.
    const error = await assertThrowsErrorAsync(async () => {
      await createPool(cognito, { EmailSendingAccount: "SES" });
    });

    // Then it is refused, naming the two values there are.
    assertInstanceOf(error, SimCognitoInvalidParameterException);
    assertStringIncludes(error.message, "COGNITO_DEFAULT, DEVELOPER");
  });
});
