import { PutPartnerEventsCommand } from "@aws-sdk/client-eventbridge";
import {
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeLambdaZipFileInput } from "../../lambda/index.js";

describe("EventBridge CloudFormation partner event buses", () => {
  const sourceName = "aws.partner/stripe.com/ed_test_billing";

  /**
   * The resources a CDK stack routing Stripe events to a function synthesizes.
   */
  const billingTemplate = {
    Resources: {
      StripeBus: {
        Type: "AWS::Events::EventBus",
        Properties: { Name: sourceName, EventSourceName: sourceName },
      },
      StripeRule: {
        Type: "AWS::Events::Rule",
        Properties: {
          EventBusName: { Ref: "StripeBus" },
          EventPattern: {
            source: [{ prefix: "aws.partner/stripe.com" }],
            "detail-type": ["customer.subscription.created"],
          },
          State: "ENABLED",
          Targets: [
            {
              Id: "billing",
              Arn: "arn:aws:lambda:us-east-1:888888888888:function:billing",
            },
          ],
        },
      },
      StripeRulePermission: {
        Type: "AWS::Lambda::Permission",
        Properties: {
          FunctionName: "billing",
          Action: "lambda:InvokeFunction",
          Principal: "events.amazonaws.com",
          SourceArn: { "Fn::GetAtt": ["StripeRule", "Arn"] },
        },
      },
    },
    Outputs: {
      BusArn: { Value: { "Fn::GetAtt": ["StripeBus", "Arn"] } },
    },
  };

  it("deploys a partner bus whose rule delivers Stripe's events", async () => {
    // Given Stripe's source shared with the Account, and a function to target.
    const simAws = new SimAws();
    const received: unknown[] = [];

    simAws.eventBridge().addPartnerEventSource(sourceName);
    await simAws.lambda().createFunction({
      input: {
        FunctionName: "billing",
        Role: "arn:aws:iam::888888888888:role/BillingRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: unknown) => {
            received.push(event);
            return { ok: true };
          }),
        },
      },
    });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "billing-stack",
      template: billingTemplate,
    });

    await stack.waitForDeployComplete();

    // When Stripe sends a subscription event.
    await simAws.eventBridge().putPartnerEvents(
      new PutPartnerEventsCommand({
        Entries: [
          {
            Source: sourceName,
            DetailType: "customer.subscription.created",
            Detail: JSON.stringify({ id: "evt_test_subscription" }),
          },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the stack's rule sent it to the function.
    assertArrayLength(received, 1);

    // And the bus ARN carries the partner name, as AWS documents.
    assertIdentical(
      stack.outputs.get("BusArn")?.value,
      `arn:aws:events:us-east-1:888888888888:event-bus/${sourceName}`,
    );
  });

  it("fails the stack when no partner shared the source", async () => {
    // Given an Account Stripe has not shared a source with.
    const simAws = new SimAws();

    // When the partner bus template is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "billing-stack",
        template: billingTemplate,
      });

      await stack.waitForDeployComplete();
    });

    // Then it fails as it would on AWS, naming the bus Resource and source.
    assertStringIncludes(error.message, "StripeBus");
    assertStringIncludes(error.message, sourceName);
  });

  it("refuses an EventSourceName that is not a string", async () => {
    // Given a template writing a list for the source name.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "billing-stack",
        template: {
          Resources: {
            StripeBus: {
              Type: "AWS::Events::EventBus",
              Properties: { Name: sourceName, EventSourceName: [sourceName] },
            },
          },
        },
      });

      await stack.waitForDeployComplete();
    });

    // Then the Resource is refused, naming the property.
    assertStringIncludes(error.message, "EventSourceName");
  });
});
