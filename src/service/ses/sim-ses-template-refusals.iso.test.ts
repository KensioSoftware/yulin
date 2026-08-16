import {
  CreateEmailTemplateCommand,
  DeleteEmailTemplateCommand,
  GetEmailTemplateCommand,
  UpdateEmailTemplateCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesAlreadyExistsException,
  SimSesBadRequestException,
  SimSesNotFoundException,
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";

describe("SimSesV2 template refusals", () => {
  it("refuses a template containing a block helper", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a template uses Handlebars beyond plain substitution.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate(
        new CreateEmailTemplateCommand({
          TemplateName: "welcome",
          TemplateContent: {
            Subject: "Welcome",
            Text: "{{#if premium}}Thanks for subscribing{{/if}}",
          },
        }),
      );
    });

    // Then it is refused where the template is written, rather than left in
    // place to survive into a sent message no real SES would produce.
    assertInstanceOf(error, SimSesUnsupportedOperationException);
    assertStringIncludes(error.message, "block helper");
  });

  it("refuses an update that introduces a block helper", async () => {
    // Given a template that renders.
    const ses = new SimAws().sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Subject: "Welcome", Text: "Hi {{name}}" },
      }),
    );

    // When it is reworded to use one.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.updateEmailTemplate(
        new UpdateEmailTemplateCommand({
          TemplateName: "welcome",
          TemplateContent: {
            Subject: "Welcome",
            Text: "{{#each items}}{{this}}{{/each}}",
          },
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);

    // And the template it had is untouched.
    const read = await ses.getEmailTemplate(
      new GetEmailTemplateCommand({ TemplateName: "welcome" }),
    );

    assertIdentical(read.TemplateContent?.Text, "Hi {{name}}");
  });

  it("refuses a template with none of its three parts", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a template is created with nothing to say.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate(
        new CreateEmailTemplateCommand({
          TemplateName: "welcome",
          TemplateContent: {},
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a template with no name", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a template is created without one.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate(
        new CreateEmailTemplateCommand({
          TemplateName: "",
          TemplateContent: { Text: "Hi" },
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a template name longer than SES accepts", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a template is created with a name past the length limit.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate(
        new CreateEmailTemplateCommand({
          TemplateName: "a".repeat(65),
          TemplateContent: { Text: "Hi" },
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a template that already exists", async () => {
    // Given a template that has been created.
    const ses = new SimAws().sesV2();
    const command = new CreateEmailTemplateCommand({
      TemplateName: "welcome",
      TemplateContent: { Text: "Hi" },
    });

    await ses.createEmailTemplate(command);

    // When the same one is created again.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate(command);
    });

    assertInstanceOf(error, SimSesAlreadyExistsException);
  });

  it("refuses reading, updating or deleting a template that is not there", async () => {
    // Given a simulated SES with no templates.
    const ses = new SimAws().sesV2();

    // When each of the three is tried on one.
    const read = await assertThrowsErrorAsync(async () => {
      await ses.getEmailTemplate(
        new GetEmailTemplateCommand({ TemplateName: "welcome" }),
      );
    });
    const updated = await assertThrowsErrorAsync(async () => {
      await ses.updateEmailTemplate(
        new UpdateEmailTemplateCommand({
          TemplateName: "welcome",
          TemplateContent: { Text: "Hi" },
        }),
      );
    });
    const deleted = await assertThrowsErrorAsync(async () => {
      await ses.deleteEmailTemplate(
        new DeleteEmailTemplateCommand({ TemplateName: "welcome" }),
      );
    });

    // Then each is a NotFoundException, as it is on real SES.
    assertInstanceOf(read, SimSesNotFoundException);
    assertInstanceOf(updated, SimSesNotFoundException);
    assertInstanceOf(deleted, SimSesNotFoundException);
  });

  it("refuses template tags, which are not simulated", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a template is created with tags.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate(
        new CreateEmailTemplateCommand({
          TemplateName: "welcome",
          TemplateContent: { Text: "Hi" },
          Tags: [{ Key: "team", Value: "orders" }],
        }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });

  it("refuses a template carrying no content at all", async () => {
    // Given a template that has been created.
    const ses = new SimAws().sesV2();

    await ses.createEmailTemplate(
      new CreateEmailTemplateCommand({
        TemplateName: "welcome",
        TemplateContent: { Text: "Hi" },
      }),
    );

    // When one is created, and another updated, with TemplateContent left out
    // of the request entirely. The SDK types make that unsayable, so these are
    // written as the bare Command shape a caller in JavaScript can still send.
    const created = await assertThrowsErrorAsync(async () => {
      await ses.createEmailTemplate({ input: { TemplateName: "receipt" } });
    });
    const updated = await assertThrowsErrorAsync(async () => {
      await ses.updateEmailTemplate({ input: { TemplateName: "welcome" } });
    });

    // Then both are refused: TemplateContent is required on real SES.
    assertInstanceOf(created, SimSesBadRequestException);
    assertInstanceOf(updated, SimSesBadRequestException);
  });
});
