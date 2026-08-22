import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithQueue } from "../../../../../test/sqs/queue-fixture.js";
import { statesExecutionRoleFactory } from "../../../../../test/stepfunctions/states-execution-role.factory.js";
import { runSimStatesTaskState } from "../../../../../test/stepfunctions/states-task-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../../dynamodb/table/sim-dynamodb-created-table.factory.js";

describe("A Task state calling a simulated service through the SDK", () => {
  it("sends a message a receive afterwards takes off the queue", async () => {
    // Given a queue, and a role allowed to send to it.
    const simAws = new SimAws();
    const { queueUrl } = await simAwsWithQueue(undefined, simAws);
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "sqs:SendMessage", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task sends one through the SDK integration, whose Parameters are
    // the request itself.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::aws-sdk:sqs:sendMessage",
        Parameters: {
          QueueUrl: queueUrl,
          "MessageBody.$": "States.JsonToString($)",
        },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    // Then the message is on the queue, and the response is the task's result.
    assertIdentical(described.status, "SUCCEEDED");
    assertStringIncludes(described.output ?? "", '"MD5OfMessageBody"');

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(received.Messages?.[0]?.Body, '{"student":"Wei"}');
  });

  it("reads an item, and the response is the task's result", async () => {
    // Given a table with an item on it.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "enrolments" },
      simAws,
    );
    await simAws.dynamoDb().putItem({
      input: {
        TableName: "enrolments",
        Item: { id: { S: "Wei" }, term: { S: "2026-autumn" } },
      },
    });
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "dynamodb:GetItem", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task reads it through the SDK integration.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::aws-sdk:dynamodb:getItem",
        Parameters: { TableName: "enrolments", Key: { id: { S: "Wei" } } },
        End: true,
      },
    });

    // Then the answer is the API's own, with no SDK metadata around it.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(
      described.output,
      '{"Item":{"id":{"S":"Wei"},"term":{"S":"2026-autumn"}}}',
    );
  });

  it("fails a task naming an operation the service does not run", async () => {
    // Given a simulated service, and an operation of it this simulator has no
    // implementation for.
    const simAws = new SimAws();
    const { queueUrl } = await simAwsWithQueue(undefined, simAws);
    const roleArn = await statesExecutionRoleFactory.make(
      { statements: [{ Effect: "Allow", Action: "sqs:*", Resource: "*" }] },
      simAws,
    );

    // When an execution reaches the task.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::aws-sdk:sqs:listQueueTags",
        Parameters: { QueueUrl: queueUrl },
        End: true,
      },
    });

    // Then the task failed, naming the operation and what SQS does run.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "listQueueTags");
    assertStringIncludes(described.cause ?? "", "sendMessage");
  });
});
