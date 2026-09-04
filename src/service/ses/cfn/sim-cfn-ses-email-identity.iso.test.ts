import { DeleteStackCommand } from "@aws-sdk/client-cloudformation";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertNotEqual,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertTypeString,
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
  simAws: SimAws = new SimAws(),
): Promise<DeployedIdentity> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        SenderIdentity: {
          Type: "AWS::SES::EmailIdentity",
          Properties: properties,
        },
      },
      Outputs: { Sender: { Value: { Ref: "SenderIdentity" } } },
    },
  });

  return { simAws, stack };
}

describe("AWS::SES::EmailIdentity", () => {
  it("creates an identity a template declares, unverified", async () => {
    // Given a template declaring a domain identity.
    const { simAws } = await deployIdentity({ EmailIdentity: "example.com" });

    // When simulated SES is asked for it.
    const identity = simAws.sesV2().findIdentity("example.com");

    // Then it is there and waiting on its verification, which is what a real
    // deploy leaves behind: the DKIM records still have to be dealt with out
    // of band.
    assertNonNullable(identity);
    assertIdentical(identity.identityType, "DOMAIN");
    assertIdentical(identity.verificationStatus, "PENDING");
    assertFalse(identity.isVerified);
  });

  it("verifies a deployed identity through the simulator accessor", async () => {
    // Given a deployed identity.
    const { simAws } = await deployIdentity({
      EmailIdentity: "hello@example.com",
    });
    const ses = simAws.sesV2();

    // When the test stands in for the emailed confirmation link.
    ses.verifyIdentity("hello@example.com");

    // Then the one the stack made is verified, rather than a second one
    // appearing beside it.
    assertArrayLength(ses.allIdentities(), 1);
    assertTrue(ses.findIdentity("hello@example.com")?.isVerified);
  });

  it("sends from an identity a template declared", async () => {
    // Given a deployed and verified identity.
    const { simAws } = await deployIdentity({ EmailIdentity: "example.com" });
    const ses = simAws.sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("example.org");

    // When a message is sent from an address at it.
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

    // Then it went, which is the whole point of deploying the identity.
    assertArrayLength(ses.sentEmails(), 1);
  });

  it("answers a Ref with the address or domain itself", async () => {
    // Given a deployed identity whose Ref is an output.
    const { stack } = await deployIdentity({
      EmailIdentity: "hello@example.com",
    });

    // Then the Ref is the identity, which is directly usable as a
    // FromEmailAddress: SES has no other identifier for one.
    assertIdentical(stack.outputs.get("Sender")?.value, "hello@example.com");
  });

  it("answers the DKIM token attributes CDK publishes as DNS records", async () => {
    // Given a template reading the three DKIM tokens off the identity, which
    // is what `ses.Identity.publicHostedZone()` in CDK emits Route53 records
    // for.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders",
      template: {
        Resources: {
          SenderIdentity: {
            Type: "AWS::SES::EmailIdentity",
            Properties: { EmailIdentity: "example.com" },
          },
        },
        Outputs: {
          Name1: {
            Value: { "Fn::GetAtt": ["SenderIdentity", "DkimDNSTokenName1"] },
          },
          Value1: {
            Value: { "Fn::GetAtt": ["SenderIdentity", "DkimDNSTokenValue1"] },
          },
          Name3: {
            Value: { "Fn::GetAtt": ["SenderIdentity", "DkimDNSTokenName3"] },
          },
        },
      },
    });

    // Then each is a record of the shape SES publishes, so the stack deploys.
    // The tokens are made up: nothing here signs a message, and refusing would
    // take down an ordinary CDK stack over records nothing reads.
    const name1 = stack.outputs.get("Name1")?.value;
    const name3 = stack.outputs.get("Name3")?.value;

    assertTypeString(name1);
    assertTypeString(name3);
    const value1 = stack.outputs.get("Value1")?.value;

    assertTypeString(value1);
    assertStringIncludes(name1, "._domainkey.example.com");
    assertStringIncludes(value1, ".dkim.amazonses.com");
    assertNotEqual(name1, name3);
  });

  it("makes the same DKIM tokens for the same identity every time", async () => {
    // Given the same identity deployed into two simulations.
    const first = await deployDkimTokenStack();
    const second = await deployDkimTokenStack();

    // Then the tokens match, so a test can assert on the records a stack
    // publishes without them moving between runs.
    assertIdentical(first, second);
  });

  it("refuses an attribute the Resource type does not have", async () => {
    // Given a template reading something off the identity that is not a DKIM
    // token.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders",
        template: {
          Resources: {
            SenderIdentity: {
              Type: "AWS::SES::EmailIdentity",
              Properties: { EmailIdentity: "example.com" },
            },
          },
          Outputs: {
            Arn: { Value: { "Fn::GetAtt": ["SenderIdentity", "Arn"] } },
          },
        },
      });
    });

    assertStringIncludes(error.message, "Arn");
  });

  it("removes the identity when the stack is deleted", async () => {
    // Given a deployed identity.
    const { simAws } = await deployIdentity({ EmailIdentity: "example.com" });

    // When the stack is deleted.
    await simAws
      .cloudFormation()
      .deleteStack(new DeleteStackCommand({ StackName: "orders" }));
    await simAws.backgroundTasksComplete();

    // Then the identity went with it.
    assertArrayEmpty(simAws.sesV2().allIdentities());
  });

  it("refuses a Resource with no EmailIdentity", async () => {
    // Given a template declaring an identity that names nothing.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIdentity({});
    });

    // Then it is refused. An identity is the thing it names, so unlike a topic
    // or a log group there is no name CloudFormation could generate.
    assertStringIncludes(error.message, "EmailIdentity is required");
  });

  it("refuses a Resource naming something that is not an identity", async () => {
    // Given a template declaring an identity that is neither an address nor a
    // domain.
    const error = await assertThrowsErrorAsync(async () => {
      await deployIdentity({ EmailIdentity: "not an identity" });
    });

    // Then simulated SES refused it, and the Resource is named in the message
    // so a deploy failure says which one asked.
    assertStringIncludes(error.message, "AWS::SES::EmailIdentity");
    assertStringIncludes(error.message, "SenderIdentity");
  });
});

/**
 * The first DKIM token name a fresh simulation reports for one identity.
 */
async function deployDkimTokenStack(): Promise<string> {
  const stack = await new SimAws().cloudFormation().deployTemplate({
    stackName: "orders",
    template: {
      Resources: {
        SenderIdentity: {
          Type: "AWS::SES::EmailIdentity",
          Properties: { EmailIdentity: "example.com" },
        },
      },
      Outputs: {
        Name1: {
          Value: { "Fn::GetAtt": ["SenderIdentity", "DkimDNSTokenName1"] },
        },
      },
    },
  });

  const name1 = stack.outputs.get("Name1")?.value;

  assertTypeString(name1);

  return name1;
}
