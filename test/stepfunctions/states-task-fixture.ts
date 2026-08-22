/**
 * Running one `Task` state and reading back how the execution ended, which
 * every test about what a task does needs before it can say anything.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`:
 * the linter rejects a test file that exports helpers alongside its own
 * `describe` calls, and `test/**` is type-checked with everything else,
 * excluded from the published build, not collected as a suite, and not counted
 * in coverage.
 */

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "../../src/service/stepfunctions/command/execution/execution.command.js";
import type { JSONObject } from "../../src/util/type-guard/json.js";
import { statesMachineFactory } from "./states-machine.factory.js";

/**
 * What a test says when it wants one `Task` state run.
 */
export interface SimStatesTaskRun {
  /**
   * The role the execution assumes. Every call the task makes is authorized
   * as it.
   */
  readonly roleArn: string;

  /**
   * The state, written as Amazon States Language.
   */
  readonly task: JSONObject;

  /**
   * The execution's input, as the JSON string `StartExecution` takes.
   */
  readonly input?: string;
}

/**
 * Run a state machine of one `Task` state and answer with how it ended.
 *
 * A failing execution is recorded rather than raised, so a test about a task
 * that fails reads the error and the cause off the same answer as one about a
 * task that worked.
 */
export async function runSimStatesTaskState(
  simAws: SimAws,
  run: SimStatesTaskRun,
): Promise<SimDescribeExecutionCommandOutput> {
  const stateMachineArn = await statesMachineFactory.make(
    { roleArn: run.roleArn, startAt: "Work", states: { Work: run.task } },
    simAws,
  );
  const started = await simAws.stepFunctions().startExecution({
    input: {
      stateMachineArn,
      ...(run.input !== undefined && { input: run.input }),
    },
  });

  return await simAws
    .stepFunctions()
    .describeExecution({ input: { executionArn: started.executionArn } });
}
