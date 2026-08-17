import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnStack } from "../../cloudformation/stack/sim-cfn-stack.js";

/**
 * What `aws-cdk-lib` emits for an SES construct set.
 *
 * ```ts
 * const identity = new ses.EmailIdentity(stack, "Identity", {
 *   identity: ses.Identity.publicHostedZone(zone),
 *   mailFromDomain: "mail.example.com",
 * });
 * new ses.CfnTemplate(stack, "Welcome", { template: { ... } });
 * ```
 *
 * The Resources are written out here rather than synthesized, so this stays an
 * isolated test. The shape that matters is the DKIM record set: CDK reads
 * three token pairs off the identity to publish them, which is what makes
 * those attributes worth answering rather than refusing.
 */
const cdkResources = {
  Identity2D60E2CC: {
    Type: "AWS::SES::EmailIdentity",
    Properties: {
      EmailIdentity: "example.com",
      MailFromAttributes: { MailFromDomain: "mail.example.com" },
    },
  },
  IdentityDkimDnsToken1: {
    Type: "AWS::Route53::RecordSet",
    Properties: {
      HostedZoneId: "Z0123456789ABCDEFGHIJ",
      Name: { "Fn::GetAtt": ["Identity2D60E2CC", "DkimDNSTokenName1"] },
      ResourceRecords: [
        { "Fn::GetAtt": ["Identity2D60E2CC", "DkimDNSTokenValue1"] },
      ],
      TTL: "1800",
      Type: "CNAME",
    },
  },
  WelcomeTemplate: {
    Type: "AWS::SES::Template",
    Properties: {
      Template: {
        TemplateName: "welcome",
        SubjectPart: "Welcome, {{name}}",
        TextPart: "Hi {{name}}",
      },
    },
  },
};

async function deployCdkStack(): Promise<{
  readonly simAws: SimAws;
  readonly stack: SimCfnStack;
}> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: cdkResources,
      Outputs: {
        Sender: { Value: { Ref: "Identity2D60E2CC" } },
        Template: { Value: { Ref: "WelcomeTemplate" } },
        DkimName: {
          Value: { "Fn::GetAtt": ["Identity2D60E2CC", "DkimDNSTokenName1"] },
        },
      },
    },
  });

  return { simAws, stack };
}

describe("CDK-synthesised SES resources", () => {
  it("deploys the identity, its DKIM records and a template together", async () => {
    // Given the Resources CDK emits for an identity with a hosted zone and a
    // template beside it.
    const { simAws, stack } = await deployCdkStack();
    const ses = simAws.sesV2();

    // Then the identity and the template are both there, and the Route53
    // record set that reads the DKIM tokens deployed rather than failing the
    // stack.
    assertNonNullable(ses.findIdentity("example.com"));
    assertNonNullable(ses.findTemplate("welcome"));
    assertIdentical(stack.outputs.get("Sender")?.value, "example.com");
    assertIdentical(stack.outputs.get("Template")?.value, "welcome");

    const dkimName = stack.outputs.get("DkimName")?.value;

    assertTypeString(dkimName);
    assertStringIncludes(dkimName, "._domainkey.example.com");
  });

  it("sends from what the CDK stack deployed", async () => {
    // Given the deployed stack, with its identity verified out of band the way
    // a real one is.
    const { simAws } = await deployCdkStack();
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");

    // When a message is sent from the template the stack declared.
    await ses.sendEmail(
      new SendEmailCommand({
        FromEmailAddress: "hello@example.com",
        Destination: { ToAddresses: ["someone@example.org"] },
        Content: {
          Template: { TemplateName: "welcome", TemplateData: '{"name":"Ada"}' },
        },
      }),
    );

    // Then it rendered, which is the whole path from a CDK stack to an
    // assertion about an email.
    assertArrayLength(ses.sentEmails(), 1);
    assertIdentical(ses.sentEmails().at(0)?.subject, "Welcome, Ada");
  });

  it("records the MAIL FROM domain it deployed without acting on", async () => {
    // Given the deployed stack.
    const { stack } = await deployCdkStack();

    // Then the property CDK wrote and this simulation has nothing to do with
    // is reported rather than passed over in silence.
    const mailFrom = stack.ignoredProperties.find(
      (property) => property.path === "MailFromAttributes",
    );

    assertNonNullable(mailFrom);
    assertStringIncludes(mailFrom.reason, "envelope sender");
  });
});
