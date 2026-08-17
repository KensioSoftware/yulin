import {
  CreateEmailTemplateCommand,
  SendEmailCommand,
  UpdateEmailTemplateCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/** The template most of these tests render. */
const welcomeContent: Readonly<Record<string, string>> = {
  Subject: "Welcome, {{name}}",
  Text: "Hi {{name}}, thanks for signing up.",
  Html: "<p>Hi {{name}}</p>",
};

/**
 * A simulated SES with both ends verified and one template stored, so a test
 * here is about the rendering rather than the identity checks.
 */
async function templatedSes(
  content: Readonly<Record<string, string>> = welcomeContent,
): Promise<SimSesV2> {
  const ses = new SimAws().sesV2();

  ses.verifyIdentity("hello@example.com");
  ses.verifyIdentity("someone@example.org");

  await ses.createEmailTemplate(
    new CreateEmailTemplateCommand({
      TemplateName: "welcome",
      TemplateContent: content,
    }),
  );

  return ses;
}

/** A send from the stored template, with whatever data the test wants. */
function templatedSend(templateData?: string): SendEmailCommand {
  return new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Template: { TemplateName: "welcome", TemplateData: templateData },
    },
  });
}

describe("SimSesV2 template sends", () => {
  it("renders the subject, text and HTML from the template data", async () => {
    // Given a simulated SES with a template.
    const ses = await templatedSes();

    // When a message is sent from it.
    await ses.sendEmail(templatedSend('{"name":"Ada"}'));

    // Then every part was rendered against the data.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.subject, "Welcome, Ada");
    assertIdentical(email.body.text, "Hi Ada, thanks for signing up.");
    assertIdentical(email.body.html, "<p>Hi Ada</p>");
  });

  it("records the template name and the data that filled it", async () => {
    // Given a simulated SES with a template.
    const ses = await templatedSes();

    // When a message is sent from it.
    await ses.sendEmail(templatedSend('{"name":"Ada"}'));

    // Then the record carries both, which is the better thing to assert on:
    // it survives someone rewording the email.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.templateName, "welcome");
    assertObjectEquals(email.templateData, { name: "Ada" });
  });

  it("records no template for a message written out in full", async () => {
    // Given a simulated SES with both ends verified.
    const ses = await templatedSes();

    // When a message is sent without a template.
    await ses.sendEmail(
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

    // Then there is no template to report, so a test can tell the two kinds of
    // send apart.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertUndefined(email.templateName);
    assertUndefined(email.templateData);
  });

  it("renders a placeholder the data does not have as nothing", async () => {
    // Given a template whose data is missing one of its placeholders.
    const ses = await templatedSes({
      Subject: "Welcome",
      Text: "Hi {{name}}, your order {{orderId}} is on its way.",
    });

    // When a message is sent with only some of them filled.
    await ses.sendEmail(templatedSend('{"name":"Ada"}'));

    // Then the hole is silent, as it is on real SES. This is much the
    // commonest surprise in an SES template, and asserting on the rendered
    // body is how it gets caught.
    assertIdentical(
      ses.sentEmails().at(0)?.body.text,
      "Hi Ada, your order  is on its way.",
    );
  });

  it("renders every placeholder empty when a send carries no data", async () => {
    // Given a template with placeholders.
    const ses = await templatedSes();

    // When a message is sent with no TemplateData at all.
    await ses.sendEmail(templatedSend());

    // Then it renders as though the data were empty, which is how real SES
    // treats a missing TemplateData.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.subject, "Welcome, ");
    assertObjectEquals(email.templateData, {});
  });

  it("reads a dotted path into the template data", async () => {
    // Given a template naming a nested value.
    const ses = await templatedSes({
      Subject: "Order {{order.id}}",
      Text: "Hi {{customer.name}}",
    });

    // When a message is sent with nested data.
    await ses.sendEmail(
      templatedSend('{"order":{"id":"A-1"},"customer":{"name":"Ada"}}'),
    );

    // Then each path was walked, as Handlebars walks it.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.subject, "Order A-1");
    assertIdentical(email.body.text, "Hi Ada");
  });

  it("renders a path that runs off the end of the data as nothing", async () => {
    // Given a template naming a nested value.
    const ses = await templatedSes({ Subject: "S", Text: "Hi {{a.b.c}}" });

    // When the data stops short of it.
    await ses.sendEmail(templatedSend('{"a":{"b":"not an object"}}'));

    assertIdentical(ses.sentEmails().at(0)?.body.text, "Hi ");
  });

  it("does not reach up the prototype chain", async () => {
    // Given a template naming something every object inherits.
    const ses = await templatedSes({
      Subject: "S",
      Text: "Hi {{constructor}}",
    });

    // When a message is sent.
    await ses.sendEmail(templatedSend("{}"));

    // Then it renders as nothing rather than reaching Object's own property.
    assertIdentical(ses.sentEmails().at(0)?.body.text, "Hi ");
  });

  it("renders numbers and booleans as well as strings", async () => {
    // Given a template naming values that are not strings.
    const ses = await templatedSes({
      Subject: "S",
      Text: "{{count}} items, gift {{isGift}}",
    });

    // When a message is sent with them.
    await ses.sendEmail(templatedSend('{"count":3,"isGift":true}'));

    assertIdentical(ses.sentEmails().at(0)?.body.text, "3 items, gift true");
  });

  it("picks up a template's new wording after an update", async () => {
    // Given a template a message has already been sent from.
    const ses = await templatedSes();

    await ses.sendEmail(templatedSend('{"name":"Ada"}'));

    // When the template is reworded and another message goes out.
    await ses.updateEmailTemplate(
      new UpdateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Hello {{name}}", Text: "Hello {{name}}" },
      }),
    );
    await ses.sendEmail(templatedSend('{"name":"Grace"}'));

    // Then the second one used the new wording, as it would on real SES: an
    // update replaces the template rather than making a new one.
    assertArrayLength(ses.sentEmails(), 2);
    assertIdentical(ses.sentEmails().at(0)?.subject, "Welcome, Ada");
    assertIdentical(ses.sentEmails().at(1)?.subject, "Hello Grace");
  });

  it("renders an empty subject for a template that has none", async () => {
    // Given a template with a body and no subject.
    const ses = await templatedSes({ Text: "Hi {{name}}" });

    // When a message is sent from it.
    await ses.sendEmail(templatedSend('{"name":"Ada"}'));

    // Then the message has no subject to speak of, which is what a message
    // sent without a Subject header amounts to.
    assertIdentical(ses.sentEmails().at(0)?.subject, "");
  });

  it("renders a template written into the send itself", async () => {
    // Given a simulated SES with both ends verified.
    const ses = await templatedSes();

    // When a message is sent with the wording inline rather than by name.
    await ses.sendEmail(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Template: {
            TemplateContent: { Subject: "Hi {{name}}", Text: "Hi {{name}}" },
            TemplateData: '{"name":"Ada"}',
          },
        },
      }),
    );

    // Then it rendered without a stored template, and there is no template
    // name to report because none was named.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.subject, "Hi Ada");
    assertUndefined(email.templateName);
  });
});
