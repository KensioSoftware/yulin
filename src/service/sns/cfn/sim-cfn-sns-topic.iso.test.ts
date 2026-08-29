import { GetTopicAttributesCommand } from "@aws-sdk/client-sns";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringStartsWith,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimSnsTopic } from "../topic/sim-sns-topic.js";

const accountIdOneOnes = "111111111111";

const ordersTopicArn = "arn:aws:sns:eu-west-2:111111111111:orders";

function simAwsInEuWest2(): SimAws {
  return new SimAws({
    defaultAccountId: accountIdOneOnes,
    defaultRegionName: "eu-west-2",
  });
}

describe("SNS CloudFormation Topic deployment", () => {
  it("creates a topic with the attributes the template sets", async () => {
    // Given a template declaring a topic with a name and a display name.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders", DisplayName: "Orders" },
          },
        },
      },
    });

    // Then the attributes read back as an SDK caller would read them, so a
    // wrong value in the template is a wrong value in the test.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: ordersTopicArn }),
      );

    assertNonNullable(read.Attributes);
    assertIdentical(read.Attributes["TopicArn"], ordersTopicArn);
    assertIdentical(read.Attributes["DisplayName"], "Orders");
    assertIdentical(read.Attributes["Owner"], accountIdOneOnes);
  });

  it("applies a display name a template Parameter supplies", async () => {
    // Given a template taking its display name from a Parameter.
    const simAws = simAwsInEuWest2();

    // When the template is deployed with a value for it.
    await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      parameters: { TopicDisplayName: "Customer orders" },
      template: {
        Parameters: { TopicDisplayName: { Type: "String" } },
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: {
              TopicName: "orders",
              DisplayName: { Ref: "TopicDisplayName" },
            },
          },
        },
      },
    });

    // Then the topic has the value the Parameter carried.
    const read = await simAws
      .sns()
      .getTopicAttributes(
        new GetTopicAttributesCommand({ TopicArn: ordersTopicArn }),
      );

    assertIdentical(read.Attributes?.["DisplayName"], "Customer orders");
  });

  it("resolves Ref to the topic ARN and Fn::GetAtt to its ARN and name", async () => {
    // Given a template referencing its topic every way it can.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders" },
          },
        },
        Outputs: {
          TopicRef: { Value: { Ref: "OrdersTopic" } },
          TopicArn: { Value: { "Fn::GetAtt": ["OrdersTopic", "TopicArn"] } },
          TopicName: { Value: { "Fn::GetAtt": ["OrdersTopic", "TopicName"] } },
        },
      },
    });

    // Then Ref is the topic ARN, as AWS::SNS::Topic Ref is, so it can be
    // handed straight to Publish.
    assertIdentical(stack.outputs.get("TopicRef")?.value, ordersTopicArn);
    assertIdentical(stack.outputs.get("TopicArn")?.value, ordersTopicArn);
    assertIdentical(stack.outputs.get("TopicName")?.value, "orders");
  });

  it("names an unnamed topic after the stack and its logical ID", async () => {
    // Given a template leaving TopicName out, as CDK does for a topic with no
    // explicit name.
    const simAws = simAwsInEuWest2();

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: { OrdersTopic: { Type: "AWS::SNS::Topic" } },
        Outputs: {
          TopicName: { Value: { "Fn::GetAtt": ["OrdersTopic", "TopicName"] } },
        },
      },
    });

    // Then the topic is named from the stack name, the logical ID and a tail
    // derived from both, as real CloudFormation names one.
    const topicName = stack.outputs.get("TopicName")?.value;

    assertStringStartsWith(topicName, "orders-stack-OrdersTopic-");
    assertNonNullable(simAws.sns().findTopic(topicName));
  });

  it("backs the CloudFormation Resource with the simulated topic", async () => {
    // Given a deployed topic.
    const simAws = simAwsInEuWest2();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: {
        Resources: {
          OrdersTopic: {
            Type: "AWS::SNS::Topic",
            Properties: { TopicName: "orders" },
          },
        },
      },
    });

    // When the Resource is inspected.
    const resource = stack.getResource("OrdersTopic");
    assertNonNullable(resource);

    // Then it is backed by the same simulated topic the service holds, rather
    // than some other simulated resource that happens to have an ARN.
    const topic = resource.simResource;
    assertInstanceOf(topic, SimSnsTopic);
    assertIdentical(simAws.sns().findTopic("orders"), topic);
  });

  it("creates the topic in the stack's account and region", async () => {
    // Given a simulated AWS whose default scope is not the stack's.
    const simAws = new SimAws();

    // When a template is deployed into another account and region.
    await simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .cloudFormation()
      .deployTemplate({
        stackName: "orders-stack",
        template: {
          Resources: {
            OrdersTopic: {
              Type: "AWS::SNS::Topic",
              Properties: { TopicName: "orders" },
            },
          },
        },
      });

    // Then the topic exists in that account and region, and nowhere else.
    const scoped = simAws
      .account(accountIdOneOnes)
      .region("us-east-1")
      .sns()
      .findTopic("orders");

    assertNonNullable(scoped);
    assertIdentical(
      scoped.arn.value,
      "arn:aws:sns:us-east-1:111111111111:orders",
    );
    assertUndefined(simAws.sns().findTopic("orders"));
  });
});
