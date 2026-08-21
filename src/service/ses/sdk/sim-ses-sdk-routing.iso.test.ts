import {
  CreateConfigurationSetCommand,
  CreateEmailIdentityCommand,
  CreateEmailTemplateCommand,
  DeleteConfigurationSetCommand,
  DeleteEmailIdentityCommand,
  DeleteEmailTemplateCommand,
  GetAccountCommand,
  GetConfigurationSetCommand,
  GetEmailIdentityCommand,
  GetEmailTemplateCommand,
  ListConfigurationSetsCommand,
  ListEmailIdentitiesCommand,
  ListEmailTemplatesCommand,
  PutAccountDetailsCommand,
  SendBulkEmailCommand,
  SendEmailCommand,
  SESv2Client,
  UpdateEmailTemplateCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEquals,
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimSdk, SimSdkUnsupportedCommandError } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("SimSesSdkCommandRouter", () => {
  it("names every Command simulated SES handles", () => {
    // Given a scoped simulated SES.
    const simAws = new SimAws();

    // When its supported Command names are asked for.
    const names = simAws.sesV2().sdkCommandRouter().supportedCommandNames();

    // Then each simulated operation is routable by SDK Command name.
    assertArrayIncludesAll(names, [
      "CreateEmailIdentityCommand",
      "GetEmailIdentityCommand",
      "ListEmailIdentitiesCommand",
      "DeleteEmailIdentityCommand",
      "SendEmailCommand",
      "GetAccountCommand",
      "PutAccountDetailsCommand",
      "CreateEmailTemplateCommand",
      "GetEmailTemplateCommand",
      "UpdateEmailTemplateCommand",
      "ListEmailTemplatesCommand",
      "DeleteEmailTemplateCommand",
      "CreateConfigurationSetCommand",
      "GetConfigurationSetCommand",
      "ListConfigurationSetsCommand",
      "DeleteConfigurationSetCommand",
    ]);
  });

  it("has no route for a Command it does not handle", () => {
    // Given a scoped simulated SES.
    const simAws = new SimAws();

    // When an SES Command outside what is simulated is looked up.
    const route = simAws
      .sesV2()
      .sdkCommandRouter()
      .route("SendBulkEmailCommand");

    // Then there is no route for it.
    assertUndefined(route);
  });
});

describe("SES SDK interception", () => {
  it("routes an intercepted SESv2Client to simulated SES", async () => {
    // Given an intercepted SES SDK client with a verified sender.
    using simSdk = new SimSdk();
    simSdk.intercept(SESv2Client);

    const client = new SESv2Client({ region: "eu-west-2" });
    const scoped = simSdk.simAws.accountRegionScope(
      simSdk.simAws.defaultAccountId,
      "eu-west-2",
    );

    scoped.sesV2().verifyIdentity("example.com");
    scoped.sesV2().verifyIdentity("example.org");

    // When ordinary SDK code sends a welcome email.
    const sent = await client.send(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Simple: {
            Subject: { Data: "Welcome" },
            Body: { Text: { Data: "Hi there" } },
          },
        },
      }),
    );

    // Then it reached the simulated SES for the Region the client was
    // configured for, with nothing touching the network.
    const [email] = scoped.sesV2().sentEmails();

    assertNonNullable(email);
    assertIdentical(email.messageId, sent.MessageId);
    assertIdentical(email.subject, "Welcome");
    assertArrayEquals(email.destination.toAddresses, ["someone@example.org"]);
  });

  it("routes every remaining Command through the intercepted client", async () => {
    // Given an intercepted client.
    using simSdk = new SimSdk();
    simSdk.intercept(SESv2Client);

    const client = new SESv2Client({ region: "eu-west-2" });

    // When each of the remaining operations is used.
    const created = await client.send(
      new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );
    const read = await client.send(
      new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );
    const listed = await client.send(new ListEmailIdentitiesCommand({}));

    await client.send(
      new PutAccountDetailsCommand({
        MailType: "TRANSACTIONAL",
        WebsiteURL: "https://example.com",
        ProductionAccessEnabled: true,
      }),
    );
    const account = await client.send(new GetAccountCommand({}));

    await client.send(
      new DeleteEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );
    const afterDelete = await client.send(new ListEmailIdentitiesCommand({}));

    // Then each one reached simulated SES.
    assertIdentical(created.IdentityType, "DOMAIN");
    assertIdentical(read.VerificationStatus, "PENDING");
    assertArrayLength(listed.EmailIdentities ?? [], 1);
    assertTrue(account.ProductionAccessEnabled);
    assertArrayLength(afterDelete.EmailIdentities ?? [], 0);
  });

  it("routes a template send through the intercepted client", async () => {
    // Given an intercepted client with a verified sender and a template.
    using simSdk = new SimSdk();
    simSdk.intercept(SESv2Client);

    const client = new SESv2Client({ region: "eu-west-2" });
    const scoped = simSdk.simAws.accountRegionScope(
      simSdk.simAws.defaultAccountId,
      "eu-west-2",
    );

    scoped.sesV2().verifyIdentity("example.com");
    scoped.sesV2().verifyIdentity("example.org");

    await client.send(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Welcome, {{name}}", Text: "Hi {{name}}" },
      }),
    );

    // When ordinary SDK code sends from it.
    await client.send(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
        },
      }),
    );

    // Then the message was rendered and recorded with what filled it.
    const [email] = scoped.sesV2().sentEmails();

    assertNonNullable(email);
    assertIdentical(email.subject, "Welcome, Ada");
    assertIdentical(email.templateName, "welcome");

    // And the template commands round-trip through the client too.
    const read = await client.send(
      new GetEmailTemplateCommand({ TemplateName: "welcome" }),
    );
    const listed = await client.send(new ListEmailTemplatesCommand({}));

    await client.send(
      new UpdateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Hello", Text: "Hello" },
      }),
    );
    await client.send(
      new DeleteEmailTemplateCommand({ TemplateName: "welcome" }),
    );

    assertIdentical(read.TemplateContent?.Subject, "Welcome, {{name}}");
    assertArrayLength(listed.TemplatesMetadata ?? [], 1);
    assertArrayLength(scoped.sesV2().allTemplates(), 0);
  });

  it("routes the configuration set commands through the client", async () => {
    // Given an intercepted client.
    using simSdk = new SimSdk();
    simSdk.intercept(SESv2Client);

    const client = new SESv2Client({ region: "eu-west-2" });
    const scoped = simSdk.simAws.accountRegionScope(
      simSdk.simAws.defaultAccountId,
      "eu-west-2",
    );

    // When ordinary SDK code makes a set, reads it, lists them and removes it.
    await client.send(
      new CreateConfigurationSetCommand({
        ConfigurationSetName: "transactional",
        SuppressionOptions: { SuppressedReasons: ["BOUNCE"] },
      }),
    );
    const read = await client.send(
      new GetConfigurationSetCommand({ ConfigurationSetName: "transactional" }),
    );
    const listed = await client.send(new ListConfigurationSetsCommand({}));

    await client.send(
      new DeleteConfigurationSetCommand({
        ConfigurationSetName: "transactional",
      }),
    );

    // Then each one reached the simulated SES for that Region.
    assertArrayEquals(read.SuppressionOptions?.SuppressedReasons ?? [], [
      "BOUNCE",
    ]);
    assertArrayEquals(listed.ConfigurationSets ?? [], ["transactional"]);
    assertArrayLength(scoped.sesV2().allConfigurationSets(), 0);
  });

  it("keeps sends in one Region out of another", async () => {
    // Given two intercepted clients in different Regions, each with the
    // identities that Region needs.
    using simSdk = new SimSdk();
    simSdk.intercept(SESv2Client);

    const accountId = simSdk.simAws.defaultAccountId;

    for (const regionName of ["eu-west-2", "us-east-1"] as const) {
      const scoped = simSdk.simAws.accountRegionScope(accountId, regionName);

      scoped.sesV2().verifyIdentity("example.com");
      scoped.sesV2().verifyIdentity("example.org");
    }

    // When a message is sent through one of them.
    await new SESv2Client({ region: "eu-west-2" }).send(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Simple: {
            Subject: { Data: "Welcome" },
            Body: { Text: { Data: "Hi there" } },
          },
        },
      }),
    );

    // Then the other Region has no record of it, as a real account would not.
    assertArrayLength(
      simSdk.simAws
        .accountRegionScope(accountId, "us-east-1")
        .sesV2()
        .sentEmails(),
      0,
    );
    assertArrayLength(
      simSdk.simAws
        .accountRegionScope(accountId, "eu-west-2")
        .sesV2()
        .sentEmails(),
      1,
    );
  });

  it("refuses an SES Command it does not simulate on send", async () => {
    // Given an intercepted client.
    using simSdk = new SimSdk();
    simSdk.intercept(SESv2Client);

    const client = new SESv2Client({ region: "eu-west-2" });

    // When a Command outside what is simulated is sent.
    const error = await assertThrowsErrorAsync(async () => {
      await client.send(
        new SendBulkEmailCommand({
          DefaultContent: { Template: { TemplateName: "welcome" } },
          BulkEmailEntries: [
            { Destination: { ToAddresses: ["someone@example.org"] } },
          ],
        }),
      );
    });

    // Then it is refused on send, naming the Command, rather than reaching the
    // network or quietly doing nothing.
    assertInstanceOf(error, SimSdkUnsupportedCommandError);
    assertStringIncludes(error.message, "SendBulkEmailCommand");
  });
});
