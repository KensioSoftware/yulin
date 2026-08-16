import {
  PutAccountDetailsCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
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
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

/** The smallest send that SES would accept. */
const welcome = {
  FromEmailAddress: "hello@example.com",
  Destination: { ToAddresses: ["someone@example.org"] },
  Content: {
    Simple: {
      Subject: { Data: "Welcome" },
      Body: { Text: { Data: "Hi there" } },
    },
  },
} satisfies SendEmailCommandInput;

/**
 * A simulated SES out of the sandbox with the sender verified, so what a test
 * here sees refused is the input rather than an identity check.
 */
async function sendingSes(): Promise<SimSesV2> {
  const ses = new SimAws().sesV2();

  ses.verifyIdentity("hello@example.com");

  await ses.putAccountDetails(
    new PutAccountDetailsCommand({
      MailType: "TRANSACTIONAL",
      WebsiteURL: "https://example.com",
      ProductionAccessEnabled: true,
    }),
  );

  return ses;
}

describe("SimSesV2 SendEmail refusals", () => {
  it("refuses a send with no recipients", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent to nobody.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({ ...welcome, Destination: {} }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a send with no From address", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent without saying who it is from.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({ ...welcome, FromEmailAddress: undefined }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
    assertStringIncludes(error.message, "From");
  });

  it("refuses a message with neither a text nor an HTML body", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent with a subject and nothing else.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          Content: { Simple: { Subject: { Data: "Welcome" }, Body: {} } },
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a send with no content at all", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent with nothing to say.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({ ...welcome, Content: undefined }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses content naming none of the three branches", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When content is given with neither Simple, Raw nor Template in it.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(new SendEmailCommand({ ...welcome, Content: {} }));
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses raw MIME content by name", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent as raw MIME.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          Content: { Raw: { Data: new TextEncoder().encode("From: a@b.com") } },
        }),
      );
    });

    // Then it says which branch it was rather than recording a message it has
    // not read.
    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertStringIncludes(error.message, "Content.Raw");
  });

  it("refuses template content by name", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent from a template.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          Content: {
            Template: {
              TemplateName: "welcome",
              TemplateData: '{"name":"Ada"}',
            },
          },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertStringIncludes(error.message, "Content.Template");
  });

  it("refuses a message with attachments", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message carries an attachment.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          Content: {
            Simple: {
              Subject: { Data: "Welcome" },
              Body: { Text: { Data: "Hi there" } },
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

  it("refuses message tags, which are not simulated", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message carries message tags.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          EmailTags: [{ Name: "campaign", Value: "welcome" }],
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });

  it("refuses sending authorization by another identity's ARN", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a send asks to act under another identity's sending policy.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          FromEmailAddressIdentityArn:
            "arn:aws:ses:us-east-1:222222222222:identity/example.com",
        }),
      );
    });

    // Then it is refused rather than sending as an identity whose policy this
    // simulator has not read.
    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });

  it("refuses a send managed by a contact list", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a send carries list management options.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          ListManagementOptions: { ContactListName: "subscribers" },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });

  it("refuses a message with no subject", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a message is sent with a body and no subject.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.sendEmail(
        new SendEmailCommand({
          ...welcome,
          Content: { Simple: { Body: { Text: { Data: "Hi there" } } } },
        } as SendEmailCommandInput),
      );
    });

    // Then it is refused: SES marks the subject of a simple message required.
    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("accepts an empty list of message tags", async () => {
    // Given a simulated SES that would otherwise accept the message.
    const ses = await sendingSes();

    // When a send carries a tag list with nothing in it, as code that always
    // passes its tags does when there are none.
    await ses.sendEmail(new SendEmailCommand({ ...welcome, EmailTags: [] }));

    // Then it is accepted rather than refused for a feature it is not using.
    assertArrayLength(ses.sentEmails(), 1);
  });
});
