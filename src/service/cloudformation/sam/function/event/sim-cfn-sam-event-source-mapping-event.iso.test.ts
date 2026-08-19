import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import { SimLambdaEventSourceMapping } from "../../../../lambda/event-source/sim-lambda-event-source-mapping.js";
import type { SimLambdaDynamoDbStreamEvent } from "../../../../lambda/event-source/poll/sim-lambda-dynamodb-stream-event.types.js";
import type { SimLambdaSqsEvent } from "../../../../lambda/event-source/poll/sim-lambda-sqs-event.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";
import { samExpandedTemplate } from "../../sim-cfn-sam-expansion.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";
import {
  ordersQueue,
  ordersTable,
} from "./sim-cfn-sam-event-source.resources.js";

/**
 * The logical ID the event's mapping is expanded under, for an event named
 * `Work` on the function the factory builds.
 */
const mappingLogicalId = `${samFunctionTemplateLogicalId}WorkEventSourceMapping`;

/**
 * The simulated mapping a deployed template's event made.
 */
function deployedMapping(
  stack: Awaited<
    ReturnType<ReturnType<SimAws["cloudFormation"]>["deployTemplate"]>
  >,
): SimLambdaEventSourceMapping {
  const resource = stack.getResource(mappingLogicalId);

  assertNonNullable(resource);
  assertInstanceOf(resource.simResource, SimLambdaEventSourceMapping);

  return resource.simResource;
}

/**
 * A policy document a function states for itself, which has nothing to do with
 * polling and has to survive the event's own addition to the Role.
 */
const statedPolicy: SimCfnTemplateValueRecord = {
  Version: "2012-10-17",
  Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "*" }],
};

/**
 * The `Policies` of the execution Role the function is expanded with.
 */
function expandedRolePolicies(
  functionProperties: SimCfnTemplateValueRecord,
): readonly SimCfnTemplateValueRecord[] {
  const expanded = samExpandedTemplate(
    simCfnSamFunctionTemplateFactory.make({ functionProperties }),
  );
  const role = entry(
    expanded.Resources,
    `${samFunctionTemplateLogicalId}Role`,
  ) as SimCfnTemplateValueRecord;

  assertNonNullable(role);

  const properties = entry(role, "Properties") as SimCfnTemplateValueRecord;

  return (entry(properties, "Policies") ??
    []) as readonly SimCfnTemplateValueRecord[];
}

/**
 * The `Properties` the mapping is expanded with, read off the expanded
 * template rather than a deployment.
 *
 * A property simulated Lambda refuses is still a property the expansion has to
 * carry across, so it can be seen arriving before it can be deployed.
 */
function expandedMappingProperties(
  eventProperties: SimCfnTemplateValueRecord,
  eventType: string,
): SimCfnTemplateValueRecord {
  const expanded = samExpandedTemplate(
    simCfnSamFunctionTemplateFactory.make({
      functionProperties: {
        Events: { Work: { Type: eventType, Properties: eventProperties } },
      },
    }),
  );
  const mapping = entry(
    expanded.Resources,
    mappingLogicalId,
  ) as SimCfnTemplateValueRecord;

  assertNonNullable(mapping);

  return entry(mapping, "Properties") as SimCfnTemplateValueRecord;
}

/**
 * One entry of a template record, read through a Map so a logical ID coming
 * from a variable is not an index into an object.
 */
function entry(
  record: SimCfnTemplateValueRecord,
  name: string,
): SimCfnTemplateValue | undefined {
  return new Map(Object.entries(record)).get(name);
}

describe("SAM SQS and DynamoDB event expansion", () => {
  it("delivers a message on the queue an SQS event names", async () => {
    // Given a SAM function with an SQS event naming a queue the template
    // declares
    const simAws = new SimAws();
    const events: SimLambdaSqsEvent[] = [];

    // When it is deployed and a message is sent to that queue
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Work: {
              Type: "SQS",
              Properties: {
                Queue: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
                BatchSize: 5,
              },
            },
          },
        },
        resources: { OrdersQueue: ordersQueue },
      }),
      bindings: [
        {
          logicalId: samFunctionTemplateLogicalId,
          handler: (event: SimLambdaSqsEvent): undefined => {
            events.push(event);

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders")?.url,
        MessageBody: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the event made a mapping carrying the batch size it stated, and the
    // message reached the bound handler
    assertIdentical(deployedMapping(stack).batchSize, 5);
    assertArrayLength(events, 1);
    assertIdentical(events[0].Records[0]?.body, "order-1");
  });

  it("reads the stream a DynamoDB event names", async () => {
    // Given a SAM function with a DynamoDB event naming a streamed table's
    // stream
    const simAws = new SimAws();
    const events: SimLambdaDynamoDbStreamEvent[] = [];

    // When it is deployed and an item is written to that table
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "projector-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Work: {
              Type: "DynamoDB",
              Properties: {
                Stream: { "Fn::GetAtt": ["OrdersTable", "StreamArn"] },
                StartingPosition: "TRIM_HORIZON",
                BatchSize: 10,
              },
            },
          },
        },
        resources: { OrdersTable: ordersTable },
      }),
      bindings: [
        {
          logicalId: samFunctionTemplateLogicalId,
          handler: (event: SimLambdaDynamoDbStreamEvent): undefined => {
            events.push(event);

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    await simAws.dynamoDb().putItem(
      new PutItemCommand({
        TableName: "orders",
        Item: { orderId: { S: "order-1" }, total: { N: "101" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the mapping started where the event said, and the write reached the
    // bound handler as a stream record
    assertIdentical(deployedMapping(stack).startingPosition, "TRIM_HORIZON");
    assertArrayLength(events, 1);

    const record = events[0].Records[0];
    assertNonNullable(record);
    assertIdentical(record.eventName, "INSERT");
    assertIdentical(record.dynamodb.NewImage?.["total"]?.N, "101");
  });

  it("disables the mapping of an event stating Enabled false", async () => {
    // Given an SQS event the template turns off
    const simAws = new SimAws();
    const events: SimLambdaSqsEvent[] = [];

    // When it is deployed and a message is sent to the queue
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "paused-orders-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Work: {
              Type: "SQS",
              Properties: {
                Queue: { "Fn::GetAtt": ["OrdersQueue", "Arn"] },
                Enabled: false,
              },
            },
          },
        },
        resources: { OrdersQueue: ordersQueue },
      }),
      bindings: [
        {
          logicalId: samFunctionTemplateLogicalId,
          handler: (event: SimLambdaSqsEvent): undefined => {
            events.push(event);

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders")?.url,
        MessageBody: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the mapping was deployed polling nothing, and the message sat on
    // the queue
    assertIdentical(deployedMapping(stack).state, "Disabled");
    assertArrayLength(events, 0);
  });

  it("adds the permission to poll beside the policies the function stated", async () => {
    // Given a function that already carries a policy of its own, and an SQS
    // event whose mapping the execution Role has to be able to poll for
    const simAws = new SimAws();
    const events: SimLambdaSqsEvent[] = [];

    // When it is deployed and a message is sent to the queue
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "policied-orders-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Policies: [statedPolicy],
          Events: {
            Work: {
              Type: "SQS",
              Properties: { Queue: { "Fn::GetAtt": ["OrdersQueue", "Arn"] } },
            },
          },
        },
        resources: { OrdersQueue: ordersQueue },
      }),
      bindings: [
        {
          logicalId: samFunctionTemplateLogicalId,
          handler: (event: SimLambdaSqsEvent): undefined => {
            events.push(event);

            return undefined;
          },
        },
      ],
    });
    await stack.waitForDeployComplete();

    await simAws.sqs().sendMessage(
      new SendMessageCommand({
        QueueUrl: simAws.sqs().findQueue("orders")?.url,
        MessageBody: "order-1",
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the Role carries both, the policy the function stated and the one
    // the event added, and the function's own did not cost it the permission
    // to poll
    const policies = expandedRolePolicies({
      Policies: [statedPolicy],
      Events: {
        Work: {
          Type: "SQS",
          Properties: { Queue: "arn:aws:sqs:eu-west-2:111111111111:orders" },
        },
      },
    });

    assertArrayLength(policies, 2);
    assertIdentical(
      JSON.stringify(policies[0]["PolicyDocument"]),
      JSON.stringify(statedPolicy),
    );
    assertIdentical(
      policies[1]["PolicyName"],
      `${samFunctionTemplateLogicalId}WorkPollerPolicy`,
    );

    assertArrayLength(events, 1);
  });

  it("carries a FilterCriteria the event states onto the mapping", () => {
    // Given an SQS event filtering what the function is given, which is a
    // mapping property simulated Lambda refuses rather than ignores
    const criteria = {
      Filters: [{ Pattern: '{"body":{"total":[{"numeric":[">",100]}]}}' }],
    };

    // When the template is expanded
    const properties = expandedMappingProperties(
      {
        Queue: "arn:aws:sqs:eu-west-2:111111111111:orders",
        FilterCriteria: criteria,
      },
      "SQS",
    );

    // Then the criteria reached the mapping under the name the mapping reads
    // it by, rather than being dropped on the way
    assertIdentical(
      JSON.stringify(properties["FilterCriteria"]),
      JSON.stringify(criteria),
    );
  });

  it("expands nothing for an event naming no source", async () => {
    // Given a DynamoDB event that names no stream to read
    const simAws = new SimAws();

    // When it is deployed
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "sourceless-stack",
      template: simCfnSamFunctionTemplateFactory.make({
        functionProperties: {
          Events: {
            Work: {
              Type: "DynamoDB",
              Properties: { StartingPosition: "TRIM_HORIZON" },
            },
          },
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the function deployed with nothing polling for it, rather than the
    // deployment failing over a mapping with nothing to poll
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertArrayLength(stack.skippedResources, 0);
  });
});
