import {
  CreateEmailTemplateCommand,
  DeleteEmailTemplateCommand,
  GetEmailTemplateCommand,
  ListEmailTemplatesCommand,
  UpdateEmailTemplateCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;
const createdAt = new Date("2026-08-16T09:00:00.000Z");

const welcomeTemplate = {
  TemplateName: "welcome",
  TemplateContent: {
    Subject: "Welcome, {{name}}",
    Text: "Hi {{name}}, thanks for signing up.",
    Html: "<p>Hi {{name}}</p>",
  },
};

describe("SimSesV2 email templates", () => {
  it("stores a template with its placeholders unrendered", async () => {
    // Given a simulated SES with a fixed clock.
    const ses = new SimAws({ clock: new SimFixedClock(createdAt) }).sesV2();

    // When a template is created and read back.
    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand(welcomeTemplate),
    );
    const read = await ses.getEmailTemplate(
      new GetEmailTemplateCommand({ TemplateName: "welcome" }),
    );

    // Then the wording comes back as it went in, placeholders and all: a
    // template is stored unrendered and filled in at send time.
    assertIdentical(read.TemplateName, "welcome");
    assertNonNullable(read.TemplateContent);
    assertIdentical(read.TemplateContent.Subject, "Welcome, {{name}}");
    assertIdentical(read.TemplateContent.Html, "<p>Hi {{name}}</p>");
  });

  it("stores a template with only one part", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a template is created with a body and nothing else.
    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "reminder",
        TemplateContent: { Text: "Your order is on its way." },
      }),
    );
    const read = await ses.getEmailTemplate(
      new GetEmailTemplateCommand({ TemplateName: "reminder" }),
    );

    // Then the parts it does not have are absent rather than empty.
    assertNonNullable(read.TemplateContent);
    assertIdentical(read.TemplateContent.Text, "Your order is on its way.");
    assertUndefined(read.TemplateContent.Subject);
    assertUndefined(read.TemplateContent.Html);
  });

  it("names a template by the account and region it is in", async () => {
    // Given a template in one account and region.
    const ses = new SimAws()
      .accountRegionScope(accountIdTwoTwos, "us-east-1")
      .sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand(welcomeTemplate),
    );

    // When its ARN is read.
    const template = ses.findTemplate("welcome");

    // Then the ARN names that account and region.
    assertNonNullable(template);
    assertIdentical(
      template.arn,
      "arn:aws:ses:us-east-1:222222222222:template/welcome",
    );
  });

  it("creates a template in one region and not in another", async () => {
    // Given a template created in one region.
    const simAws = new SimAws();

    await simAws
      .accountRegionScope(simAws.defaultAccountId, "us-east-1")
      .sesV2()
      .createEmailTemplate(new CreateEmailTemplateCommand(welcomeTemplate));

    // When another region is asked for it.
    const elsewhere = simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .sesV2()
      .findTemplate("welcome");

    // Then it is not there, as it would not be on real SES.
    assertUndefined(elsewhere);
  });

  it("tells two templates whose names differ only in case apart", async () => {
    // Given a template.
    const ses = new SimAws().sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand(welcomeTemplate),
    );

    // When one differing only in case is created.
    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        ...welcomeTemplate,
        TemplateName: "Welcome",
      }),
    );

    // Then both are there. A template name is matched exactly, unlike an
    // identity, which has a domain to fold the case of.
    assertArrayLength(ses.allTemplates(), 2);
  });

  it("replaces a template's wording without moving its creation time", async () => {
    // Given a template that has been created.
    const ses = new SimAws({ clock: new SimFixedClock(createdAt) }).sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand(welcomeTemplate),
    );

    // When it is updated.
    await ses.updateEmailTemplate(
      new UpdateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Hello, {{name}}", Text: "Hello" },
      }),
    );
    const read = await ses.getEmailTemplate(
      new GetEmailTemplateCommand({ TemplateName: "welcome" }),
    );

    // Then the wording is replaced outright rather than merged, and the
    // template is the same one it was: real SES updates in place.
    assertNonNullable(read.TemplateContent);
    assertIdentical(read.TemplateContent.Subject, "Hello, {{name}}");
    assertUndefined(read.TemplateContent.Html);
    assertIdentical(
      ses.findTemplate("welcome")?.createdDate.getTime(),
      createdAt.getTime(),
    );
  });

  it("lists templates with the time each was made", async () => {
    // Given two templates.
    const ses = new SimAws({ clock: new SimFixedClock(createdAt) }).sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand(welcomeTemplate),
    );
    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "receipt",
        TemplateContent: { Subject: "Your receipt", Text: "Thanks" },
      }),
    );

    // When they are listed.
    const listed = await ses.listEmailTemplates(
      new ListEmailTemplatesCommand({}),
    );

    // Then each is reported by name and creation time, in creation order. The
    // wording is not listed: that needs GetEmailTemplate, one at a time.
    assertNonNullable(listed.TemplatesMetadata);
    assertArrayEquals(
      listed.TemplatesMetadata.map((template) => template.TemplateName),
      ["welcome", "receipt"],
    );
    assertIdentical(
      listed.TemplatesMetadata[0]?.CreatedTimestamp.getTime(),
      createdAt.getTime(),
    );
  });

  it("pages a listing of templates", async () => {
    // Given more templates than one page holds.
    const ses = new SimAws().sesV2();

    for (const name of ["one", "two", "three"]) {
      // oxlint-disable-next-line no-await-in-loop
      await ses.createEmailTemplate(
        new CreateEmailTemplateCommand({
          TemplateName: name,
          TemplateContent: { Text: name },
        }),
      );
    }

    // When they are read a page at a time.
    const first = await ses.listEmailTemplates(
      new ListEmailTemplatesCommand({ PageSize: 2 }),
    );
    const second = await ses.listEmailTemplates(
      new ListEmailTemplatesCommand({
        PageSize: 2,
        NextToken: first.NextToken,
      }),
    );

    // Then the token from the first page reaches the rest.
    assertArrayLength(first.TemplatesMetadata ?? [], 2);
    assertArrayEquals(
      second.TemplatesMetadata?.map((template) => template.TemplateName),
      ["three"],
    );
    assertUndefined(second.NextToken);
  });

  it("deletes a template", async () => {
    // Given a template.
    const ses = new SimAws().sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand(welcomeTemplate),
    );

    // When it is deleted.
    await ses.deleteEmailTemplate(
      new DeleteEmailTemplateCommand({ TemplateName: "welcome" }),
    );

    // Then it is gone.
    assertArrayEmpty(ses.allTemplates());
  });
});
