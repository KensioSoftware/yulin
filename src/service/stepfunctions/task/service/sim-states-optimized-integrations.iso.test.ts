import { GetItemCommand } from "@aws-sdk/client-dynamodb";
import { PutRuleCommand, PutTargetsCommand } from "@aws-sdk/client-eventbridge";
import { AddPermissionCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simSnsSubscribedFunction } from "../../../../../test/sns/function-fixture.js";
import { simAwsWithTopic } from "../../../../../test/sns/topic-fixture.js";
import { simAwsWithQueue } from "../../../../../test/sqs/queue-fixture.js";
import { statesExecutionRoleFactory } from "../../../../../test/stepfunctions/states-execution-role.factory.js";
import { runSimStatesTaskState } from "../../../../../test/stepfunctions/states-task-fixture.js";
import { makeLambdaZipFileInput } from "../../../lambda/function/code/lambda-zip-file-input.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../../dynamodb/table/sim-dynamodb-created-table.factory.js";

describe("The Task state integrations Step Functions optimises", () => {
  it("writes an item a GetItem afterwards reads back", async () => {
    // Given a table, and a role allowed to write to that table alone.
    const simAws = new SimAws();
    const table = await simDynamoDbCreatedTableFactory.make(
      { tableName: "enrolments" },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          {
            Effect: "Allow",
            Action: "dynamodb:PutItem",
            Resource: table.arn,
          },
        ],
      },
      simAws,
    );

    // When a task writes an item it built from the execution's input.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:putItem",
        Parameters: {
          TableName: "enrolments",
          Item: { id: { "S.$": "$.student" }, term: { S: "2026-autumn" } },
        },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    // Then the item is on the table.
    assertIdentical(described.status, "SUCCEEDED");

    const read = await simAws.dynamoDb().getItem(
      new GetItemCommand({
        TableName: "enrolments",
        Key: { id: { S: "Wei" } },
      }),
    );

    assertObjectEquals(read.Item ?? {}, {
      id: { S: "Wei" },
      term: { S: "2026-autumn" },
    });
  });

  it("answers a getItem with the item the table holds", async () => {
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

    // When a task reads it.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:getItem",
        Parameters: { TableName: "enrolments", Key: { id: { S: "Wei" } } },
        ResultSelector: { "term.$": "$.Item.term.S" },
        End: true,
      },
    });

    // Then the response is the task's result, with no SDK metadata around it.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"term":"2026-autumn"}');
  });

  it("publishes a message a subscribed function is delivered", async () => {
    // Given a topic with a function subscribed to it.
    const simAws = new SimAws();
    const { topicArn } = await simAwsWithTopic(undefined, simAws);
    const subscribed = await simSnsSubscribedFunction(
      simAws,
      "announce-enrolment",
      topicArn,
    );
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "sns:Publish", Resource: topicArn },
        ],
      },
      simAws,
    );

    // When a task publishes a message written as JSON rather than as a string.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::sns:publish",
        Parameters: {
          TopicArn: topicArn,
          Message: { "student.$": "$.student", enrolled: true },
        },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    await simAws.backgroundTasksComplete();

    // Then the subscribed function was delivered the message as a string, the
    // way a real publish carries it.
    assertIdentical(described.status, "SUCCEEDED");
    assertStringIncludes(described.output ?? "", '"MessageId"');

    const record = subscribed.events[0]?.Records[0];

    assertNonNullable(record, "The subscribed function was delivered a record");
    assertIdentical(record.Sns["Message"], '{"student":"Wei","enrolled":true}');
  });

  it("sends a message written as a string as it was written", async () => {
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

    // When a task sends a message body that is already a string.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::sqs:sendMessage",
        Parameters: { QueueUrl: queueUrl, "MessageBody.$": "$.student" },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    // Then the queue holds what the state built, with no quotes around it.
    assertIdentical(described.status, "SUCCEEDED");

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(received.Messages?.[0]?.Body, "Wei");
  });

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

    // When a task sends a message body written as JSON.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::sqs:sendMessage",
        Parameters: {
          QueueUrl: queueUrl,
          MessageBody: { "student.$": "$.student" },
        },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    // Then a receive takes it off the queue.
    assertIdentical(described.status, "SUCCEEDED");

    const received = await simAws
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(received.Messages?.[0]?.Body, '{"student":"Wei"}');
  });

  it("puts an event a rule matches and delivers", async () => {
    // Given a rule that invokes a function for enrolment events.
    const simAws = new SimAws();
    const details: unknown[] = [];

    await simAws.lambda().createFunction({
      input: {
        FunctionName: "record-enrolment",
        Role: "arn:aws:iam::123456789012:role/FunctionRole",
        Code: {
          ZipFile: makeLambdaZipFileInput((event: { detail: unknown }) => {
            details.push(event.detail);

            return "recorded";
          }),
        },
      },
    });
    await simAws.lambda().addPermission(
      new AddPermissionCommand({
        FunctionName: "record-enrolment",
        StatementId: "AllowEvents",
        Action: "lambda:InvokeFunction",
        Principal: "events.amazonaws.com",
      }),
    );
    await simAws.eventBridge().putRule(
      new PutRuleCommand({
        Name: "enrolments",
        EventPattern: JSON.stringify({ source: ["enrolment.service"] }),
      }),
    );
    await simAws.eventBridge().putTargets(
      new PutTargetsCommand({
        Rule: "enrolments",
        Targets: [
          {
            Id: "record",
            Arn: `arn:aws:lambda:${simAws.defaultRegionName}:${simAws.defaultAccountId}:function:record-enrolment`,
          },
        ],
      }),
    );
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "events:PutEvents", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task puts an event whose Detail is written as JSON.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::events:putEvents",
        Parameters: {
          Entries: [
            {
              Source: "enrolment.service",
              DetailType: "Enrolled",
              Detail: { "student.$": "$.student" },
            },
          ],
        },
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    await simAws.backgroundTasksComplete();

    // Then the rule matched the event and the target read the detail.
    assertIdentical(described.status, "SUCCEEDED");
    assertStringIncludes(described.output ?? "", '"FailedEntryCount":0');
    assertObjectEquals(details[0] ?? {}, { student: "Wei" });
  });
});
