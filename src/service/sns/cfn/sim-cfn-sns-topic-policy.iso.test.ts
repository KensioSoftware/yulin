import { GetTopicAttributesCommand, PublishCommand } from "@aws-sdk/client-sns";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";

const s3ServicePrincipal = {
  kind: "service",
  service: "s3.amazonaws.com",
} as const;

/**
 * A template deploying a topic and the topic policy admitting S3 to it, which
 * is what CDK synthesises for a Bucket notifying a topic.
 */
function ordersTemplate(
  policyStatement: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersTopic: {
        Type: "AWS::SNS::Topic",
        Properties: { TopicName: "orders" },
      },
      OrdersTopicPolicy: {
        Type: "AWS::SNS::TopicPolicy",
        Properties: {
          Topics: [{ Ref: "OrdersTopic" }],
          PolicyDocument: {
            Version: "2012-10-17",
            Statement: [policyStatement],
          },
        },
      },
    },
    Outputs: { OrdersTopicArn: { Value: { Ref: "OrdersTopic" } } },
  };
}

describe("AWS::SNS::TopicPolicy", () => {
  it("deploys the policy it names onto the topic", async () => {
    // Given a template declaring a topic and a policy admitting S3 to it.
    const simAws = new SimAws();
    const topicArn = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

    // When the template is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTemplate({
        Effect: "Allow",
        Principal: { Service: "s3.amazonaws.com" },
        Action: "sns:Publish",
        Resource: topicArn,
      }),
    });

    // Then the topic carries the policy the template named.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: topicArn }),
      );

    assertNonNullable(read.Attributes?.["Policy"]);
    assertStringIncludes(read.Attributes["Policy"], "s3.amazonaws.com");

    // And the policy takes effect: S3 may publish to the topic.
    const published = await simAws
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }), {
        caller: s3ServicePrincipal,
      });

    assertNonNullable(published.MessageId);
  });

  it("deploys a policy that admits nobody it does not name", async () => {
    // Given a template whose topic policy admits S3 for another topic.
    const simAws = new SimAws();
    const topicArn = `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:orders`;

    // When the template is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: ordersTemplate({
        Effect: "Allow",
        Principal: { Service: "s3.amazonaws.com" },
        Action: "sns:Publish",
        Resource: `arn:aws:sns:${simAws.defaultRegionName}:${simAws.defaultAccountId}:invoices`,
      }),
    });

    // Then S3 is refused, rather than the deployed policy admitting anyone who
    // asks.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .sns()
        .publish(
          new PublishCommand({ TopicArn: topicArn, Message: "order-1" }),
          { caller: s3ServicePrincipal },
        );
    });

    assertIdentical(error.name, "AuthorizationErrorException");
  });

  it("fails a policy document SetTopicAttributes would refuse", async () => {
    // Given a template whose policy statement has no Effect, which is not a
    // policy document sim IAM will validate.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: ordersTemplate({
          Principal: { Service: "s3.amazonaws.com" },
          Action: "sns:Publish",
          Resource: "*",
        }),
      });
    });

    // And it says which Resource was invalid, with SNS's own reason inside it.
    assertStringIncludes(
      error.message,
      "Invalid AWS::SNS::TopicPolicy Resource OrdersTopicPolicy",
    );
    assertStringIncludes(error.message, "Policy Error");
  });

  it("refuses a Resource naming no topics", async () => {
    // Given a topic policy with an empty Topics list, which names nothing to
    // set the policy on.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTopicPolicy: {
              Type: "AWS::SNS::TopicPolicy",
              Properties: { Topics: [], PolicyDocument: { Statement: [] } },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "AWS::SNS::TopicPolicy OrdersTopicPolicy requires a Topics list",
    );
  });

  it("refuses a Resource with no PolicyDocument object", async () => {
    // Given a topic policy whose document is a string rather than an object.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTopic: {
              Type: "AWS::SNS::Topic",
              Properties: { TopicName: "orders" },
            },
            OrdersTopicPolicy: {
              Type: "AWS::SNS::TopicPolicy",
              Properties: {
                Topics: [{ Ref: "OrdersTopic" }],
                PolicyDocument: "{}",
              },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "AWS::SNS::TopicPolicy OrdersTopicPolicy requires a PolicyDocument object",
    );
  });

  it("refuses a Topics entry that is not a topic ARN string", async () => {
    // Given a topic policy whose Topics list carries a number.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTopicPolicy: {
              Type: "AWS::SNS::TopicPolicy",
              Properties: { Topics: [7], PolicyDocument: { Statement: [] } },
            },
          },
        },
      });
    });

    assertStringIncludes(
      error.message,
      "requires each entry of Topics to be a topic ARN string, got number",
    );
  });
});
