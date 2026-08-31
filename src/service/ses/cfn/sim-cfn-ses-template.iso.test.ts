import { DeleteStackCommand } from "@aws-sdk/client-cloudformation";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface DeployedTemplate {
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
}

const welcomeWording = {
  TemplateName: "welcome",
  SubjectPart: "Welcome, {{name}}",
  TextPart: "Hi {{name}}, thanks for signing up.",
  HtmlPart: "<p>Hi {{name}}</p>",
};

async function deployTemplate(
  template: SimCfnTemplateValueRecord,
  simAws: SimAws = new SimAws(),
): Promise<DeployedTemplate> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        WelcomeEmail: {
          Type: "AWS::SES::Template",
          Properties: { Template: template },
        },
      },
      Outputs: {
        Name: { Value: { Ref: "WelcomeEmail" } },
        Id: { Value: { "Fn::GetAtt": ["WelcomeEmail", "Id"] } },
      },
    },
  });

  return { simAws, stack };
}

describe("AWS::SES::Template", () => {
  it("creates a template a stack declares", async () => {
    // Given a template declaring an email template.
    const { simAws } = await deployTemplate(welcomeWording);

    // When simulated SES is asked for it.
    const template = simAws.sesV2().findTemplate("welcome");

    // Then the wording is there with its placeholders unrendered, under the
    // API's own names rather than the CloudFormation ones.
    assertNonNullable(template);
    assertIdentical(template.content.subject, "Welcome, {{name}}");
    assertIdentical(template.content.html, "<p>Hi {{name}}</p>");
  });

  it("renders a send from a template a stack declared", async () => {
    // Given a deployed template and a verified sender.
    const { simAws } = await deployTemplate(welcomeWording);
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");

    // When a message is sent from it.
    await ses.sendEmail(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
        },
      }),
    );

    // Then it rendered, which is what deploying the template was for.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.subject, "Welcome, Ada");
    assertIdentical(email.templateName, "welcome");
  });

  it("answers a Ref and the Id attribute with the template name", async () => {
    // Given a deployed template naming both in its outputs.
    const { stack } = await deployTemplate(welcomeWording);

    // Then both are the name, which is the only identifier SES gives a
    // template and is directly usable as the TemplateName of a send.
    assertIdentical(stack.outputs.get("Name")?.value, "welcome");
    assertIdentical(stack.outputs.get("Id")?.value, "welcome");
  });

  it("names an unnamed template after the stack and logical ID", async () => {
    // Given a template that does not name itself, as CDK often leaves one.
    const { simAws, stack } = await deployTemplate({
      SubjectPart: "Welcome",
      TextPart: "Hi",
    });

    // Then CloudFormation named it, the way it names any unnamed Resource.
    const name = stack.outputs.get("Name")?.value;

    assertStringStartsWith(name, "orders-WelcomeEmail-");
    assertNonNullable(simAws.sesV2().findTemplate(name));
  });

  it("leaves out a part the template does not set", async () => {
    // Given a template with a text body and no HTML one.
    const { simAws } = await deployTemplate({
      TemplateName: "reminder",
      SubjectPart: "Your order",
      TextPart: "On its way",
    });

    // Then the part it does not have is absent rather than empty, so a test
    // asserting on the HTML of a text-only message finds nothing.
    assertUndefined(simAws.sesV2().findTemplate("reminder")?.content.html);
  });

  it("removes the template when the stack is deleted", async () => {
    // Given a deployed template.
    const { simAws } = await deployTemplate(welcomeWording);

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the template went with it.
    assertArrayEmpty(simAws.sesV2().allTemplates());
  });

  it("fails the deploy on Handlebars this simulation cannot render", async () => {
    // Given a template carrying a block helper.
    const error = await assertThrowsErrorAsync(async () => {
      await deployTemplate({
        TemplateName: "welcome",
        SubjectPart: "Welcome",
        TextPart: "{{#if premium}}Thanks for subscribing{{/if}}",
      });
    });

    // Then the deploy fails rather than storing a template that would fail at
    // the first send, and the Resource is named so it says which one asked.
    assertStringIncludes(error.message, "AWS::SES::Template");
    assertStringIncludes(error.message, "WelcomeEmail");
    assertStringIncludes(error.message, "block helper");
  });

  it("refuses a Resource with no Template property", async () => {
    // Given a template declaring an email template with nothing in it.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            WelcomeEmail: { Type: "AWS::SES::Template", Properties: {} },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Template is required");
  });

  it("refuses a wording part that is not a string", async () => {
    // Given a template whose subject is a number.
    const error = await assertThrowsErrorAsync(async () => {
      await deployTemplate({ TemplateName: "welcome", SubjectPart: 42 });
    });

    assertStringIncludes(
      error.message,
      "Template.SubjectPart must be a string",
    );
  });

  it("records a misspelled wording part rather than dropping it", async () => {
    // Given a template that misspells one of its parts, which is the mistake
    // this reporting exists to catch.
    const { simAws, stack } = await deployTemplate({
      TemplateName: "welcome",
      SubjectPart: "Welcome",
      Textpart: "Hi there",
    });

    // Then the template deployed with no body, and the property it was created
    // without is named rather than dropped in silence.
    assertUndefined(simAws.sesV2().findTemplate("welcome")?.content.text);

    const ignored = stack.ignoredProperties.find(
      (property) => property.path === "Template.Textpart",
    );

    assertNonNullable(ignored);
    assertStringIncludes(ignored.reason, "AWS::SES::Template");
  });

  it("records a property sitting beside Template", async () => {
    // Given a template with a stray property outside the wording.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          WelcomeEmail: {
            Type: "AWS::SES::Template",
            Properties: {
              Template: { TemplateName: "welcome", TextPart: "Hi" },
              Tags: [{ Key: "team", Value: "orders" }],
            },
          },
        },
      },
    });

    // Then it is recorded too: a stray property can sit beside Template as
    // well as inside it.
    assertNonNullable(
      stack.ignoredProperties.find((property) => property.path === "Tags"),
    );
  });
});
