import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simLambdaAliasedFunction } from "../../../../test/lambda/alias-fixture.js";
import { statesExecutionRoleFactory } from "../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../test/stepfunctions/states-machine.factory.js";
import { statesTaskFunctionFactory } from "../../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "../command/execution/execution.command.js";
import { SimStepFunctions } from "../sim-step-functions.js";

describe("Where a Task state invokes", () => {
  /**
   * Run a state machine of one task and read back how the execution ended.
   */
  async function runTask(
    simAws: SimAws,
    roleArn: string,
    task: JSONObject,
    input = '{"term":3}',
  ): Promise<SimDescribeExecutionCommandOutput> {
    const stateMachineArn = await statesMachineFactory.make(
      { roleArn, startAt: "Check", states: { Check: task } },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input } });

    return await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });
  }

  it("invokes a function in another Region of the same Account", async () => {
    // Given a function in a Region the state machine is not in.
    const simAws = new SimAws({ defaultRegionName: "eu-west-2" });
    const check = await statesTaskFunctionFactory.make(
      { handler: () => ({ eligible: true }), regionName: "us-east-1" },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution invokes it by ARN.
    const described = await runTask(simAws, roleArn, {
      Type: "Task",
      Resource: check.arn,
      End: true,
    });

    // Then the ARN found the function in its own Region.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"eligible":true}');
  });

  it("reads a function named by a path as the function to invoke", async () => {
    // Given an invocation reading which function to call out of its input.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      { handler: () => ({ eligible: true }) },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution carries the name.
    const described = await runTask(
      simAws,
      roleArn,
      {
        Type: "Task",
        Resource: "arn:aws:states:::lambda:invoke",
        Parameters: { "FunctionName.$": "$.checker" },
        End: true,
      },
      '{"checker":"check-enrolment"}',
    );

    // Then the function the input named is the one that ran.
    assertIdentical(described.status, "SUCCEEDED");
    assertStringIncludes(described.output ?? "", '"eligible":true');
  });

  it("fails a task whose FunctionName is not a function", async () => {
    // Given an invocation naming a queue.
    const simAws = new SimAws();
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, {
      Type: "Task",
      Resource: "arn:aws:states:::lambda:invoke",
      Parameters: {
        FunctionName: "arn:aws:sqs:eu-west-2:123456789012:enrolments",
      },
      End: true,
    });

    // Then the task failed rather than looking for a function of that name.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "not the ARN of a Lambda");
  });

  it("fails a task whose state machine has no role to assume", async () => {
    // Given a state machine created with something that is not a role ARN.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(simAws, "WorkflowRole", {
      Type: "Task",
      Resource: "arn:aws:states:::lambda:invoke",
      Parameters: { FunctionName: "check-enrolment" },
      End: true,
    });

    // Then the task failed, saying what the RoleArn was.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "not an IAM role ARN");
  });

  it("fails a task on a simulated Step Functions built on its own", async () => {
    // Given a service with no simulation around it to reach a function in.
    const stepFunctions = new SimStepFunctions();
    const created = await stepFunctions.createStateMachine({
      input: {
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition: JSON.stringify({
          StartAt: "Check",
          States: {
            Check: {
              Type: "Task",
              Resource: "arn:aws:states:::lambda:invoke",
              Parameters: { FunctionName: "check-enrolment" },
              End: true,
            },
          },
        }),
      },
    });

    // When an execution reaches the task.
    const started = await stepFunctions.startExecution({
      input: { stateMachineArn: created.stateMachineArn },
    });
    const described = await stepFunctions.describeExecution({
      input: { executionArn: started.executionArn },
    });

    // Then it says there was nowhere to invoke, rather than answering as if
    // the function had run.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "no functions to invoke");
  });

  it("invokes the version an alias points at", async () => {
    // Given a function with a published version behind an alias, which is what
    // CDK writes when a workflow invokes an alias.
    const simAws = new SimAws();
    const check = await simLambdaAliasedFunction(simAws, "check-enrolment");
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When a task names the alias ARN.
    const described = await runTask(simAws, roleArn, {
      Type: "Task",
      Resource: check.aliasArn,
      End: true,
    });

    // Then the version the alias points at ran, rather than $LATEST.
    assertIdentical(described.status, "SUCCEEDED");
    assertArrayEquals(check.ranAs, [check.version]);
  });
});
