import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsError,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimLambdaEventSourceMappingCfn } from "../../../cloudformation/resource/cfn/lambda/sim-lambda-event-source-mapping-cfn.js";
import { SimLambdaEventSourceMapping } from "../../event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaSqsEvent } from "../../event-source/poll/sim-lambda-sqs-event.js";
import { SimLambdaCloudFormationResourceFactory } from "../sim-cfn-lambda-resource-factory.js";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

const mappingProperties: SimCfnTemplateValueRecord = {
  EventSourceArn: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
  FunctionName: { Ref: "ConsumerFunction" },
  BatchSize: 5,
  FunctionResponseTypes: ["ReportBatchItemFailures"],
};

/**
 * A template with a queue, a consumer function whose role may poll it, and a
 * mapping between them, as CDK's `fn.addEventSource(new SqsEventSource(queue))`
 * synthesises one.
 */
function consumerTemplate(
  properties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrderQueue: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "orders" },
      },
      ConsumerRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrderConsumerRole",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
          Policies: [
            {
              PolicyName: "ConsumeOrders",
              PolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                  {
                    Effect: "Allow",
                    Action: [
                      "sqs:ReceiveMessage",
                      "sqs:DeleteMessage",
                      "sqs:GetQueueAttributes",
                    ],
                    Resource: { "Fn::GetAtt": ["OrderQueue", "Arn"] },
                  },
                ],
              },
            },
          ],
        },
      },
      ConsumerFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "order-consumer",
          Role: { "Fn::GetAtt": ["ConsumerRole", "Arn"] },
        },
      },
      OrderConsumerMapping: {
        Type: "AWS::Lambda::EventSourceMapping",
        Properties: properties,
      },
    },
    Outputs: {
      MappingRef: { Value: { Ref: "OrderConsumerMapping" } },
      MappingArn: {
        Value: {
          "Fn::GetAtt": ["OrderConsumerMapping", "EventSourceMappingArn"],
        },
      },
      MappingId: { Value: { "Fn::GetAtt": ["OrderConsumerMapping", "Id"] } },
    },
  };
}

/**
 * Attempt a mapping creation with the given properties and answer with the
 * error it is refused with.
 */
async function mappingCreationError(
  properties: SimCfnTemplateValueRecord,
): Promise<Error> {
  const simAws = new SimAws();
  const resource = new SimCfnResource({
    accountRegionScope: {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    },
    logicalId: "BadMapping",
    template: {
      Type: "AWS::Lambda::EventSourceMapping",
      Properties: properties,
    },
  });
  const factory = new SimLambdaCloudFormationResourceFactory(simAws.lambda());

  try {
    await factory.create("EventSourceMapping", resource, {
      simAws,
      resources: new Map(),
    });
  } catch (error) {
    assertInstanceOf(error, Error);

    return error;
  }

  throw new Error("Expected event source mapping creation to reject");
}

describe("Lambda CloudFormation event source mapping deployment", () => {
  it("creates a mapping that delivers from AWS::Lambda::EventSourceMapping", async () => {
    // Given a template with a queue, a function and a mapping between them.
    const simAws = new SimAws();
    const events: SimLambdaSqsEvent[] = [];

    // When the template is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: consumerTemplate(mappingProperties),
      bindings: [
        {
          logicalId: "ConsumerFunction",
          handler: (event: SimLambdaSqsEvent): undefined => {
            events.push(event);

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    // Then the Resource is backed by a simulated mapping.
    const resource = stack.getResource("OrderConsumerMapping");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimLambdaEventSourceMapping);
    assertIdentical(resource.simResource.batchSize, 5);
    assertTrue(resource.simResource.reportsBatchItemFailures);

    // And Ref resolves to the mapping's UUID, Fn::GetAtt to its ARN.
    assertIdentical(
      stack.outputs.get("MappingRef")?.value,
      resource.simResource.uuid,
    );
    assertIdentical(
      stack.outputs.get("MappingArn")?.value,
      resource.simResource.arn,
    );
    assertIdentical(
      stack.outputs.get("MappingId")?.value,
      resource.simResource.uuid,
    );

    // And a message sent to the deployed queue reaches the deployed function.
    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders")?.url,
        MessageBody: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });

  it("refuses an attribute AWS::Lambda::EventSourceMapping does not have", () => {
    // Given the CloudFormation-facing adapter for a mapping.
    const adapter = new SimLambdaEventSourceMappingCfn({
      mapping: new SimLambdaEventSourceMapping({
        accountRegionScope: {
          accountId: "111111111111" as SimAwsAccountId,
          regionName: "eu-west-2",
        },
        eventSourceArn: "arn:aws:sqs:eu-west-2:111111111111:orders",
        functionName: "order-consumer",
        functionArn:
          "arn:aws:lambda:eu-west-2:111111111111:function:order-consumer",
        createdAt: new Date(0),
      }),
    });

    // When a template asks for an attribute the Resource does not have.
    const error = assertThrowsError(() => adapter.attributeValue("Nonsense"));

    // Then it fails rather than resolving to something made up.
    assertStringIncludes(error.message, "Nonsense");
  });

  it("refuses a property this simulation does not model", async () => {
    // Given a template asking a mapping to filter events.
    const error = await mappingCreationError({
      ...mappingProperties,
      FilterCriteria: { Filters: [{ Pattern: "{}" }] },
    });

    // Then the Resource fails rather than deploying a mapping ignoring it.
    assertStringIncludes(
      error.message,
      "Invalid AWS::Lambda::EventSourceMapping Resource BadMapping: " +
        "FilterCriteria is a real AWS::Lambda::EventSourceMapping property",
    );
  });

  it("refuses a property AWS::Lambda::EventSourceMapping does not have", async () => {
    // Given a template with a made-up property.
    const error = await mappingCreationError({
      ...mappingProperties,
      Nonsense: "true",
    });

    // Then the Resource fails rather than dropping it.
    assertStringIncludes(
      error.message,
      "Nonsense is not an AWS::Lambda::EventSourceMapping property",
    );
  });

  it("refuses a list property that is not a list", async () => {
    // Given a template whose response types are a bare string.
    const error = await mappingCreationError({
      EventSourceArn: "arn:aws:sqs:eu-west-2:111111111111:orders",
      FunctionName: "order-consumer",
      FunctionResponseTypes: "ReportBatchItemFailures",
    });

    // Then the Resource fails with a diagnostic naming the property.
    assertStringIncludes(error.message, "FunctionResponseTypes must be a list");
  });

  it("refuses a list entry that is not a string", async () => {
    // Given a template whose response types hold a number.
    const error = await mappingCreationError({
      EventSourceArn: "arn:aws:sqs:eu-west-2:111111111111:orders",
      FunctionName: "order-consumer",
      FunctionResponseTypes: [7],
    });

    // Then the Resource fails with a diagnostic naming the entry.
    assertStringIncludes(
      error.message,
      "FunctionResponseTypes[0] must be a string",
    );
  });

  it("refuses a malformed property value", async () => {
    // Given a template whose batch size is a string.
    const error = await mappingCreationError({
      EventSourceArn: "arn:aws:sqs:eu-west-2:111111111111:orders",
      FunctionName: "order-consumer",
      BatchSize: "five",
    });

    // Then the Resource fails with a diagnostic naming the property.
    assertInstanceOf(error, TypeError);
    assertStringIncludes(error.message, "BatchSize must be a number");
  });
});
