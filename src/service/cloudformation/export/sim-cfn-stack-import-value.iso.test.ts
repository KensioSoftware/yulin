import { describe, it } from "vitest";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";

const producerTemplate = (
  exportName: string,
  queueName: string,
): CfnTemplateBodyRecord => ({
  Resources: {
    SharedQueue: {
      Type: "AWS::SQS::Queue",
      Properties: { QueueName: queueName },
    },
  },
  Outputs: {
    SharedQueueUrl: {
      Value: { Ref: "SharedQueue" },
      Export: { Name: exportName },
    },
  },
});

const consumerTemplate = (exportName: string): CfnTemplateBodyRecord => ({
  Resources: {
    Consumer: {
      Type: "AWS::SNS::Topic",
      Properties: {
        TopicName: "consumer-topic",
        DisplayName: { "Fn::ImportValue": exportName },
      },
    },
  },
});

describe("Fn::ImportValue between simulated Stacks", () => {
  it("resolves an import against an export another deployed Stack published", async () => {
    // Given a producer Stack that exports its Queue URL.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    const producer = await cloudFormation.deployTemplate({
      stackName: "ProducerStack",
      template: producerTemplate("ProducerStack:SharedQueueUrl", "shared"),
    });
    const exportedUrl = producer.outputs.get("SharedQueueUrl")?.value;

    // When a second Stack imports that export name.
    const consumer = await cloudFormation.deployTemplate({
      stackName: "ConsumerStack",
      template: consumerTemplate("ProducerStack:SharedQueueUrl"),
    });

    // Then the consumer's Resource was created holding the producer's value.
    assertIdentical(consumer.lifecycle.status, "CREATE_COMPLETE");
    assertIdentical(
      consumer.resources.get("Consumer")?.properties["DisplayName"],
      exportedUrl,
    );
  });

  it("refuses an import naming an export no deployed Stack has published", async () => {
    // Given a simulation with no Stack exporting anything.
    const simAws = new SimAws();

    // When a Stack imports a name nothing published.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "ConsumerStack",
        template: consumerTemplate("ProducerStack:SharedQueueUrl"),
      }),
    );

    // Then it is refused the way CloudFormation refuses one, and no Stack is
    // left behind under the name.
    assertIdentical(error.name, "ValidationError");
    assertStringIncludes(
      error.message,
      "No export named ProducerStack:SharedQueueUrl found",
    );
    assertUndefined(simAws.cloudFormation().getStackByName("ConsumerStack"));
  });

  it("refuses a Stack exporting a name another Stack already exports", async () => {
    // Given a Stack that already exports a name.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    await cloudFormation.deployTemplate({
      stackName: "ProducerStack",
      template: producerTemplate("SharedQueueUrl", "shared"),
    });

    // When a second Stack exports the same name.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.deployTemplate({
        stackName: "RivalStack",
        template: producerTemplate("SharedQueueUrl", "rival"),
      }),
    );

    // Then that Stack fails to deploy, naming the Stack holding the export.
    assertStringIncludes(
      error.message,
      "Export with name SharedQueueUrl is already exported by stack ProducerStack",
    );

    const rival = cloudFormation.getStackByName("RivalStack");
    assertIdentical(rival?.status, "CREATE_FAILED");
  });

  it("refuses an Export Name that resolves to something other than a string", async () => {
    // Given a Stack whose Export Name resolves to a list.
    const simAws = new SimAws();

    // When it deploys.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "ProducerStack",
        template: {
          Resources: {
            SharedQueue: { Type: "AWS::SQS::Queue", Properties: {} },
          },
          Outputs: {
            SharedQueueUrl: {
              Value: { Ref: "SharedQueue" },
              Export: { Name: { "Fn::Split": [",", "one,two"] } },
            },
          },
        },
      }),
    );

    // Then the Export is refused rather than published under a name no import
    // could ever spell.
    assertStringIncludes(
      error.message,
      "Output SharedQueueUrl Export Name must resolve to a string, got object",
    );
  });

  it("frees an export name once the Stack that published it is deleted", async () => {
    // Given a deployed producer Stack holding an export name.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const producer = await cloudFormation.deployTemplate({
      stackName: "ProducerStack",
      template: producerTemplate("SharedQueueUrl", "shared"),
    });

    // When the producer is deleted.
    await producer.delete();
    await producer.waitForDeleteComplete();
    await simAws.backgroundTasksComplete();

    // Then another Stack can export the same name.
    const replacement = await cloudFormation.deployTemplate({
      stackName: "ReplacementStack",
      template: producerTemplate("SharedQueueUrl", "replacement"),
    });

    assertIdentical(replacement.lifecycle.status, "CREATE_COMPLETE");
    assertNonNullable(replacement.outputs.get("SharedQueueUrl")?.exportName);
  });
});
