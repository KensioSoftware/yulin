import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../../test/stepfunctions/states-machine.factory.js";
import { runSimStatesTaskState } from "../../../../../test/stepfunctions/states-task-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCreatedTableFactory } from "../../../dynamodb/table/sim-dynamodb-created-table.factory.js";

describe("What a service refusing a Task state's call is called", () => {
  it("names a conditional check the way Amazon States Language does", async () => {
    // Given a table already holding the item a guarded write would add.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "enrolments" },
      simAws,
    );
    await simAws.dynamoDb().putItem({
      input: { TableName: "enrolments", Item: { id: { S: "Wei" } } },
    });
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "dynamodb:PutItem", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task writes it under a condition that does not hold.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:putItem",
        Parameters: {
          TableName: "enrolments",
          Item: { id: { S: "Wei" }, term: { S: "2026-autumn" } },
          ConditionExpression: "attribute_not_exists(id)",
        },
        End: true,
      },
    });

    // Then the task failed under the name a Retry or a Catch matches on.
    assertIdentical(
      described.error,
      "DynamoDb.ConditionalCheckFailedException",
    );
    assertStringIncludes(described.cause ?? "", "conditional request failed");
  });

  it("hands the failure to a Catch naming it", async () => {
    // Given a table already holding the item a guarded write would add.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "enrolments" },
      simAws,
    );
    await simAws.dynamoDb().putItem({
      input: { TableName: "enrolments", Item: { id: { S: "Wei" } } },
    });
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "dynamodb:PutItem", Resource: "*" },
        ],
      },
      simAws,
    );

    // When the task that writes it catches the conditional check by name.
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Record",
        states: {
          Record: {
            Type: "Task",
            Resource: "arn:aws:states:::dynamodb:putItem",
            Parameters: {
              TableName: "enrolments",
              Item: { id: { S: "Wei" } },
              ConditionExpression: "attribute_not_exists(id)",
            },
            Catch: [
              {
                ErrorEquals: ["DynamoDb.ConditionalCheckFailedException"],
                Next: "Enrolled",
              },
            ],
            End: true,
          },
          Enrolled: { Type: "Succeed" },
        },
      },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });

    // Then the execution carried on at the state the catcher named.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
    assertArrayEquals(
      simAws.stepFunctions().inspection().visitedStates(started.executionArn),
      ["Record", "Enrolled"],
    );
  });

  it("fails a task whose role may not do what it asked", async () => {
    // Given a role allowed to read the table and nothing else.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "enrolments" },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "dynamodb:GetItem", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task writes to it.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:putItem",
        Parameters: { TableName: "enrolments", Item: { id: { S: "Wei" } } },
        End: true,
      },
    });

    // Then the task failed as access denied, which is what simulated IAM calls
    // a refusal, and the cause names the action the role was missing.
    assertIdentical(described.error, "DynamoDb.AccessDenied");
    assertStringIncludes(described.cause ?? "", "dynamodb:PutItem");
  });

  it("names a request the service would not accept", async () => {
    // Given a table whose key an item has to carry.
    const simAws = new SimAws();
    await simDynamoDbCreatedTableFactory.make(
      { tableName: "enrolments" },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "dynamodb:PutItem", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task writes an item without it.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:putItem",
        Parameters: {
          TableName: "enrolments",
          Item: { term: { S: "2026-autumn" } },
        },
        End: true,
      },
    });

    // Then the service's own name for what it refused is the task's error.
    assertIdentical(described.error, "DynamoDb.ValidationException");
  });

  it("names the service that refused, whichever service it was", async () => {
    // Given a role allowed to put events on the default bus.
    const simAws = new SimAws();
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "events:PutEvents", Resource: "*" },
        ],
      },
      simAws,
    );

    // When a task puts events without saying what any of them are.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::events:putEvents",
        Parameters: { Source: "enrolment.service" },
        End: true,
      },
    });

    // Then the error carries EventBridge's own name for what it refused.
    assertIdentical(described.error, "EventBridge.ValidationException");
    assertStringIncludes(described.cause ?? "", "between 1 and 10 entries");
  });

  it("fails a task whose Parameters built no request", async () => {
    // Given a task sending what its InputPath selected, which is a name rather
    // than a request.
    const simAws = new SimAws();
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution reaches it.
    const described = await runSimStatesTaskState(simAws, {
      roleArn,
      task: {
        Type: "Task",
        Resource: "arn:aws:states:::dynamodb:putItem",
        InputPath: "$.student",
        End: true,
      },
      input: JSON.stringify({ student: "Wei" }),
    });

    // Then the execution failed saying the call had nothing to send.
    assertIdentical(described.error, "States.Runtime");
    assertStringIncludes(described.cause ?? "", "built no request");
  });
});
