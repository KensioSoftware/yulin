import {
  GetEmailIdentityCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

interface DeployedIdentity {
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
}

async function deployIdentity(
  properties: SimCfnTemplateValueRecord,
): Promise<DeployedIdentity> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        SenderIdentity: {
          Type: "AWS::SES::EmailIdentity",
          Properties: properties,
        },
      },
    },
  });

  return { simAws, stack };
}

describe("AWS::SES::EmailIdentity settings", () => {
  it("holds the DKIM and MAIL FROM settings its template declares", async () => {
    // Given a template setting everything CDK readily writes on an identity.
    const { simAws } = await deployIdentity({
      EmailIdentity: "example.com",
      DkimAttributes: { SigningEnabled: true },
      MailFromAttributes: {
        MailFromDomain: "mail.example.com",
        BehaviorOnMxFailure: "REJECT_MESSAGE",
      },
      FeedbackAttributes: { EmailForwardingEnabled: false },
      ConfigurationSetAttributes: { ConfigurationSetName: "transactional" },
      Tags: [{ Key: "team", Value: "orders" }],
    });

    // When the deployed identity is read back through the ordinary command.
    const identity = await simAws
      .sesV2()
      .getEmailIdentity(
        new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
      );

    // Then it reports what the stack described, so a test can assert the
    // identity it deployed is the one it asked for.
    const mailFrom = identity.MailFromAttributes;

    assertTrue(identity.DkimAttributes?.SigningEnabled);
    assertNonNullable(mailFrom);
    assertIdentical(mailFrom.MailFromDomain, "mail.example.com");
    assertIdentical(mailFrom.BehaviorOnMxFailure, "REJECT_MESSAGE");
    assertFalse(identity.FeedbackForwardingStatus);
    assertIdentical(identity.ConfigurationSetName, "transactional");
    assertArrayLength(identity.Tags, 1);
  });

  it("defaults the MX failure behaviour CDK leaves out", async () => {
    // Given the MAIL FROM property as CDK writes it, with no behaviour on it.
    const { simAws } = await deployIdentity({
      EmailIdentity: "example.com",
      MailFromAttributes: { MailFromDomain: "mail.example.com" },
    });

    // When the identity is read back.
    const identity = await simAws
      .sesV2()
      .getEmailIdentity(
        new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
      );

    // Then the behaviour is the one real CloudFormation defaults to, and the
    // domain is still waiting on the MX record that would prove it.
    const mailFrom = identity.MailFromAttributes;

    assertNonNullable(mailFrom);
    assertIdentical(mailFrom.BehaviorOnMxFailure, "USE_DEFAULT_VALUE");
    assertIdentical(mailFrom.MailFromDomainStatus, "PENDING");
  });

  it("drops a signing private key, recording it as ignored", async () => {
    // Given a template bringing its own DKIM key.
    const { simAws, stack } = await deployIdentity({
      EmailIdentity: "example.com",
      DkimSigningAttributes: {
        DomainSigningSelector: "selector1",
        DomainSigningPrivateKey: "MIIEvQIBADANBg",
      },
    });

    // Then the selector is held and the key is not, since nothing here signs a
    // message and a secret with no use is worth forgetting.
    const identity = await simAws
      .sesV2()
      .getEmailIdentity(
        new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
      );

    assertIdentical(
      identity.DkimAttributes?.SigningAttributesOrigin,
      "EXTERNAL",
    );
    assertArrayLength(stack.ignoredProperties, 1);
    assertIdentical(
      stack.ignoredProperties[0].path,
      "DkimSigningAttributes.DomainSigningPrivateKey",
    );
  });

  it("reads a boolean a template wrote in quotes", async () => {
    // Given a template turning DKIM off with the string CloudFormation carries
    // when a Ref resolves to a boolean.
    const { simAws } = await deployIdentity({
      EmailIdentity: "example.com",
      DkimAttributes: { SigningEnabled: "false" },
      DkimSigningAttributes: { NextSigningKeyLength: "RSA_2048_BIT" },
    });

    // Then signing is off and the key length is still held, so a stack that
    // quotes its booleans reads the same as one that does not.
    const identity = await simAws
      .sesV2()
      .getEmailIdentity(
        new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
      );
    const dkim = identity.DkimAttributes;

    assertNonNullable(dkim);
    assertFalse(dkim.SigningEnabled);
    assertIdentical(dkim.Status, "NOT_STARTED");
    assertIdentical(dkim.NextSigningKeyLength, "RSA_2048_BIT");
  });

  it("keeps the whole tags a template wrote and drops the halves", async () => {
    // Given a template with one complete tag and one missing its value.
    const { simAws } = await deployIdentity({
      EmailIdentity: "example.com",
      Tags: [{ Key: "team", Value: "orders" }, { Key: "owner" }],
    });

    // Then the identity deployed with the tag it could read, rather than the
    // whole stack failing over half a tag nothing here is billed by.
    const identity = await simAws
      .sesV2()
      .getEmailIdentity(
        new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
      );

    assertArrayLength(identity.Tags, 1);
    assertIdentical(identity.Tags[0].Key, "team");
  });

  it("sends through the configuration set its template attached", async () => {
    // Given an identity deployed with a configuration set on it, as CDK's
    // `configurationSet` prop writes one.
    const { simAws, stack } = await deployIdentity({
      EmailIdentity: "example.com",
      ConfigurationSetAttributes: { ConfigurationSetName: "transactional" },
    });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("someone@example.org");

    // When a message is sent from the identity, naming no set of its own.
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

    // Then the message went through the set the stack attached, and the
    // property is nowhere on the ignored list.
    const [email] = ses.sentEmails();

    assertNonNullable(email);
    assertIdentical(email.configurationSetName, "transactional");
    assertArrayLength(stack.ignoredProperties, 0);
  });

  it("records a property this Resource type does not have", async () => {
    // Given a template with a misspelled property on the identity.
    const { simAws, stack } = await deployIdentity({
      EmailIdentity: "example.com",
      DkimAttribute: { SigningEnabled: true },
    });

    // Then the identity deployed anyway, with the stray property reported
    // rather than a stack taken down over a name AWS may have added last week.
    assertNonNullable(simAws.sesV2().findIdentity("example.com"));
    assertArrayLength(stack.ignoredProperties, 1);
    assertIdentical(stack.ignoredProperties[0].path, "DkimAttribute");
  });
});
