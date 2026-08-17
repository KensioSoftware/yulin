import {
  CreateEmailTemplateCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesBadRequestException,
  SimSesNotFoundException,
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/** A simulated SES with both ends verified, so a send reaches the rendering. */
function sendingSes(): SimSesV2 {
  const ses = new SimAws().sesV2();

  ses.verifyIdentity("hello@example.com");
  ses.verifyIdentity("someone@example.org");

  return ses;
}

/** A send from a stored template, with whatever data the test wants. */
function templatedSend(
  templateName: string,
  templateData?: string,
): SendEmailCommand {
  return new SendEmailCommand({
    FromEmailAddress: "hello@example.com",
    Destination: { ToAddresses: ["someone@example.org"] },
    Content: {
      Template: { TemplateName: templateName, TemplateData: templateData },
    },
  });
}

describe("SimSesV2 template send refusals", () => {
  it("refuses a send naming a template that is not there", async () => {
    // Given a simulated SES with no templates.
    const ses = sendingSes();

    // When a message is sent from one.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(templatedSend("welcome", "{}"));
    });

    // Then it fails rather than sending an empty message, and nothing is
    // recorded.
    assertInstanceOf(error, SimSesNotFoundException);
    assertArrayLength(ses.sentEmails(), 0);
  });

  it("refuses template data that is not JSON", async () => {
    // Given a simulated SES with a template.
    const ses = sendingSes();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Hi {{name}}", Text: "Hi {{name}}" },
      }),
    );

    // When a message is sent with malformed data.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(templatedSend("welcome", "{not json"));
    });

    // Then it is refused rather than silently rendering nothing.
    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses template data that is not a JSON object", async () => {
    // Given a simulated SES with a template.
    const ses = sendingSes();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Hi {{name}}", Text: "Hi {{name}}" },
      }),
    );

    // When a message is sent with a JSON array rather than an object.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(templatedSend("welcome", '["Ada"]'));
    });

    // Then it is refused: placeholders are read off an object.
    assertInstanceOf(error, SimSesBadRequestException);
  });
  it("refuses template data holding something that cannot go in a message", async () => {
    // Given a template naming a value.
    const ses = sendingSes();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Hi", Text: "Hi {{customer}}" },
      }),
    );

    // When the data has an object where the template wants a name.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        templatedSend("welcome", '{"customer":{"name":"Ada"}}'),
      );
    });

    // Then it says so. Real Handlebars would put `[object Object]` in the
    // message, which nobody means to send.
    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertStringIncludes(error.message, "{{customer}}");
  });

  it("refuses a template send naming neither a template nor its content", async () => {
    // Given a simulated SES with both ends verified.
    const ses = sendingSes();

    // When a send carries an empty template branch.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          FromEmailAddress: "hello@example.com",
          Destination: { ToAddresses: ["someone@example.org"] },
          Content: { Template: {} },
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses sending another Account's shared template", async () => {
    // Given a simulated SES with both ends verified.
    const ses = sendingSes();

    // When a send names a template by ARN rather than by name.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          FromEmailAddress: "hello@example.com",
          Destination: { ToAddresses: ["someone@example.org"] },
          Content: {
            Template: {
              TemplateArn:
                "arn:aws:ses:us-east-1:222222222222:template/welcome",
            },
          },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });
  it("refuses a send naming both a template and its content", async () => {
    // Given a simulated SES with a stored template.
    const ses = sendingSes();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Stored", Text: "Stored" },
      }),
    );

    // When a send names that template and also writes wording out inline.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          FromEmailAddress: "hello@example.com",
          Destination: { ToAddresses: ["someone@example.org"] },
          Content: {
            Template: {
              TemplateName: "welcome",
              TemplateContent: { Subject: "Inline", Text: "Inline" },
            },
          },
        }),
      );
    });

    // Then it is refused rather than rendering one and recording the other,
    // which would file the message under a template it never came from.
    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertArrayLength(ses.sentEmails(), 0);
  });

  it("refuses attachments on a template send", async () => {
    // Given a simulated SES with both ends verified.
    const ses = sendingSes();

    // When a template send carries an attachment.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          FromEmailAddress: "hello@example.com",
          Destination: { ToAddresses: ["someone@example.org"] },
          Content: {
            Template: {
              TemplateContent: { Text: "Hi" },
              Attachments: [
                { FileName: "terms.pdf", RawContent: new Uint8Array([1]) },
              ],
            },
          },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });
});
