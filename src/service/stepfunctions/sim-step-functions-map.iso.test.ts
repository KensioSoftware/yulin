import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import { statesTaskFunctionFactory } from "../../../test/stepfunctions/states-task-function.factory.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";
import type { SimDescribeExecutionCommandOutput } from "./command/execution/execution.command.js";

describe("Simulated Step Functions Map", () => {
  /**
   * The students a Map state runs over, as the execution input holds them.
   */
  const students = JSON.stringify({
    term: 3,
    students: [{ id: "wei" }, { id: "mei" }, { id: "jun" }, { id: "lan" }],
  });

  /**
   * An item processor of one `Pass` state, which answers with its input.
   */
  const echoing: JSONObject = {
    StartAt: "Register",
    States: { Register: { Type: "Pass", End: true } },
  };

  /**
   * Run a workflow whose first state is the `Map` state under test.
   */
  async function runWorkflow(
    simAws: SimAws,
    state: JSONObject,
    input = students,
  ): Promise<string> {
    return await statesExecutionFactory.make({ state, input }, simAws);
  }

  /**
   * What the execution ended as, as the JSON it answered with.
   */
  async function outputOf(
    simAws: SimAws,
    executionArn: string,
  ): Promise<unknown> {
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "SUCCEEDED");

    return JSON.parse(described.output ?? "null") as unknown;
  }

  it("runs the processor once per item, in input order", async () => {
    // Given a Map state over four records.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      ItemProcessor: echoing,
      End: true,
    });

    // When it runs, the result holds one output per item, in the order the
    // items were in.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { id: "wei" },
      { id: "mei" },
      { id: "jun" },
      { id: "lan" },
    ]);

    // Then the iterations are reported apart from the states around them.
    const iterations = simAws
      .stepFunctions()
      .inspection()
      .iterations(executionArn);

    assertArrayLength(iterations, 4);
    assertObjectEquals(
      iterations.map((iteration) => iteration.index),
      [0, 1, 2, 3],
    );
    assertObjectEquals(
      iterations.map((iteration) => iteration.visitedStates),
      [["Register"], ["Register"], ["Register"], ["Register"]],
    );
  });

  it("answers in item order whatever order the iterations finished in", async () => {
    // Given iterations that wait for as long as their own item says, so the
    // last item is the first one done.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      {
        Type: "Map",
        ItemProcessor: {
          StartAt: "Settle",
          States: {
            Settle: { Type: "Wait", SecondsPath: "$.wait", Next: "Register" },
            Register: { Type: "Pass", End: true },
          },
        },
        End: true,
      },
      '[{"id":"wei","wait":180},{"id":"mei","wait":120},{"id":"jun","wait":60}]',
    );

    // When simulated time passes all three waits.
    await simAws.clock().advanceBy({ minutes: 5 });

    // Then the result is in the order the items were in.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { id: "wei", wait: 180 },
      { id: "mei", wait: 120 },
      { id: "jun", wait: 60 },
    ]);
  });

  it("builds each iteration's input from the ItemSelector", async () => {
    // Given a Map state whose ItemSelector reads the item, its index and the
    // state's own input, and a task that answers with what it was given.
    const simAws = new SimAws();
    const enrol = await statesTaskFunctionFactory.make(
      { functionName: "enrol-student", handler: (event: unknown) => event },
      simAws,
    );
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      ItemSelector: {
        "id.$": "$$.Map.Item.Value.id",
        "at.$": "$$.Map.Item.Index",
        "term.$": "$.term",
      },
      ItemProcessor: {
        StartAt: "Enrol",
        States: { Enrol: { Type: "Task", Resource: enrol.arn, End: true } },
      },
      End: true,
    });

    // When it runs, each iteration's task was given what the selector built.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { id: "wei", at: 0, term: 3 },
      { id: "mei", at: 1, term: 3 },
      { id: "jun", at: 2, term: 3 },
      { id: "lan", at: 3, term: 3 },
    ]);
  });

  it("reads the item inside the iteration as well", async () => {
    // Given an item processor reading the context object itself.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      ItemProcessor: {
        StartAt: "Register",
        States: {
          Register: {
            Type: "Pass",
            Parameters: { "student.$": "$$.Map.Item.Value.id" },
            End: true,
          },
        },
      },
      End: true,
    });

    // When it runs, the states inside the iteration read the item too.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { student: "wei" },
      { student: "mei" },
      { student: "jun" },
      { student: "lan" },
    ]);
  });

  it("runs over the whole input where no ItemsPath says otherwise", async () => {
    // Given a Map state whose input is the array itself.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      { Type: "Map", ItemProcessor: echoing, End: true },
      '[{"id":"wei"},{"id":"mei"}]',
    );

    // When it runs, every item went through the processor.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { id: "wei" },
      { id: "mei" },
    ]);
  });

  it("reads the older spellings CDK still writes", async () => {
    // Given a Map state written with Iterator and Parameters, as CDK writes
    // one built through its deprecated call and property.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Map",
      ItemsPath: "$.students",
      Parameters: { "id.$": "$$.Map.Item.Value.id", "term.$": "$.term" },
      Iterator: echoing,
      End: true,
    });

    // When it runs, Iterator ran as the item processor and Parameters built
    // each iteration's input.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { id: "wei", term: 3 },
      { id: "mei", term: 3 },
      { id: "jun", term: 3 },
      { id: "lan", term: 3 },
    ]);
  });

  it("answers with an empty array where there are no items", async () => {
    // Given a Map state over an array holding nothing.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      {
        Type: "Map",
        ItemsPath: "$.students",
        ItemProcessor: echoing,
        ResultPath: "$.enrolled",
        End: true,
      },
      '{"students":[]}',
    );

    // When it runs, the processor ran no times and the state still answered.
    assertObjectEquals(await outputOf(simAws, executionArn), {
      students: [],
      enrolled: [],
    });
    assertArrayLength(
      simAws.stepFunctions().inspection().iterations(executionArn),
      0,
    );
  });

  /**
   * Run a Map state that is expected to fail, and read back how it did.
   */
  async function failureFrom(
    simAws: SimAws,
    state: JSONObject,
    input: string,
  ): Promise<SimDescribeExecutionCommandOutput> {
    const executionArn = await runWorkflow(
      simAws,
      { Type: "Map", ItemProcessor: echoing, End: true, ...state },
      input,
    );

    return await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });
  }

  it("fails the state where the items are not an array", async () => {
    // Given an ItemsPath naming a field holding something else, and one
    // naming a field that is not there at all.
    // When each runs, each fails the state saying what it found.
    const failures = await Promise.all([
      failureFrom(
        new SimAws(),
        { ItemsPath: "$.students" },
        '{"students":{"id":"wei"}}',
      ),
      failureFrom(new SimAws(), { ItemsPath: "$.enrolled" }, students),
      failureFrom(new SimAws(), {}, students),
    ]);

    const [anObject, nothing, wholeInput] = failures;

    assertObjectEquals(
      failures.map((described) => described.error),
      ["States.Runtime", "States.Runtime", "States.Runtime"],
    );
    assertIdentical(
      anObject.cause,
      "The Map state Check reads its items from $.students, which holds " +
        '{"id":"wei"} rather than an array.',
    );
    assertIdentical(
      nothing.cause,
      "The Map state Check reads its items from $.enrolled, which holds " +
        "nothing rather than an array.",
    );
    assertStringIncludes(
      wholeInput.cause ?? "",
      "reads its items from $, which holds",
    );
  });
});
