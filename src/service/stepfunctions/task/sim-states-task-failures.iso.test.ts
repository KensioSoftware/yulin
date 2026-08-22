import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionRoleFactory } from "../../../../test/stepfunctions/states-execution-role.factory.js";
import { statesMachineFactory } from "../../../../test/stepfunctions/states-machine.factory.js";
import { statesTaskFunctionFactory } from "../../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../../util/type-guard/json.js";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "../command/execution/execution.command.js";

describe("Simulated Step Functions Task failures", () => {
  /**
   * An error of a handler's own, as a workflow's own failures are written.
   */
  class NotEligible extends Error {
    public override readonly name = "NotEligible";
  }

  /**
   * Run a state machine of one task and read back how the execution ended.
   */
  async function runTask(
    simAws: SimAws,
    roleArn: string,
    task: JSONObject,
  ): Promise<SimDescribeExecutionCommandOutput> {
    const stateMachineArn = await statesMachineFactory.make(
      { roleArn, startAt: "Check", states: { Check: task } },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: '{"term":3}' } });

    return await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });
  }

  /**
   * The task the tests below run, which invokes a function that is there.
   */
  const invokeCheck = {
    Type: "Task",
    Resource: "arn:aws:states:::lambda:invoke",
    Parameters: { FunctionName: "check-enrolment", "Payload.$": "$" },
    End: true,
  };

  it("fails a task whose role may not invoke the function", async () => {
    // Given a role that may read a bucket and nothing else.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make({}, simAws);
    const roleArn = await statesExecutionRoleFactory.make(
      {
        statements: [
          { Effect: "Allow", Action: "s3:GetObject", Resource: "*" },
        ],
      },
      simAws,
    );

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, invokeCheck);

    // Then the task failed, naming the action the role is missing.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "lambda:InvokeFunction");
  });

  it("fails a task whose role does not trust Step Functions", async () => {
    // Given a role a Lambda function would assume rather than an execution.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make({}, simAws);
    const roleArn = await statesExecutionRoleFactory.make(
      { trusts: "lambda.amazonaws.com" },
      simAws,
    );

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, invokeCheck);

    // Then the execution could not assume the role at all.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "AssumeRolePolicyDocument");
  });

  it("fails a task whose role is not there", async () => {
    // Given a state machine naming a role nothing created.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(
      simAws,
      "arn:aws:iam::123456789012:role/AbsentRole",
      invokeCheck,
    );

    // Then the task failed, naming the role.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "AbsentRole");
  });

  it("fails a task naming a function that is not there", async () => {
    // Given a state machine invoking a function nothing created.
    const simAws = new SimAws();
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, invokeCheck);

    // Then the task failed, naming what it was asked to invoke.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(described.cause ?? "", "check-enrolment");
  });

  it("reports a handler that raises as a task failure", async () => {
    // Given a function that raises, invoked through the Lambda integration.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      {
        handler: () => {
          throw new Error("the enrolment service is down");
        },
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, invokeCheck);

    // Then the execution failed under the name Step Functions gives a task
    // that failed, carrying what the handler said.
    assertIdentical(described.error, "States.TaskFailed");
    assertStringIncludes(
      described.cause ?? "",
      "the enrolment service is down",
    );
  });

  it("reports a handler raising through a function ARN under its own error type", async () => {
    // Given a function raising an error of its own, invoked through its ARN.
    const simAws = new SimAws();
    const check = await statesTaskFunctionFactory.make(
      {
        handler: () => {
          throw new NotEligible("no place left");
        },
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);

    // When an execution reaches the task.
    const described = await runTask(simAws, roleArn, {
      Type: "Task",
      Resource: check.arn,
      End: true,
    });

    // Then the execution failed under the handler's own error type, which is
    // the name a Retry or a Catch on this form matches.
    assertIdentical(described.error, "NotEligible");
    assertStringIncludes(described.cause ?? "", "no place left");
  });

  it("records a task failing after a Wait rather than raising from the clock", async () => {
    // Given a workflow that waits and then invokes a function that raises.
    const simAws = new SimAws();
    await statesTaskFunctionFactory.make(
      {
        handler: () => {
          throw new Error("the enrolment service is down");
        },
      },
      simAws,
    );
    const roleArn = await statesExecutionRoleFactory.make({}, simAws);
    const stateMachineArn = await statesMachineFactory.make(
      {
        roleArn,
        startAt: "Hold",
        states: {
          Hold: { Type: "Wait", Seconds: 300, Next: "Check" },
          Check: invokeCheck,
        },
      },
      simAws,
    );
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });

    // When simulated time moves past the wait.
    await simAws.clock().advanceBy({ minutes: 6 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then advancing the clock returned as it would for an execution that
    // succeeded, and the failure is read off the execution.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.TaskFailed");
  });
});
