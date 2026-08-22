import {
  assertArrayLength,
  assertIdentical,
  assertObjectEquals,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { statesExecutionFactory } from "../../../test/stepfunctions/states-execution.factory.js";
import type { JSONObject } from "../../util/type-guard/json.js";
import { SimAws } from "../aws/sim-aws.js";

describe("Simulated Step Functions Parallel", () => {
  /**
   * A branch of one `Pass` state, which answers with what it is given.
   */
  function echoing(name: string): JSONObject {
    return { StartAt: name, States: { [name]: { Type: "Pass", End: true } } };
  }

  /**
   * A branch of one `Pass` state answering with a result of its own.
   */
  function answering(name: string, result: JSONObject): JSONObject {
    return {
      StartAt: name,
      States: { [name]: { Type: "Pass", Result: result, End: true } },
    };
  }

  /**
   * Run a workflow whose first state is the `Parallel` state under test.
   */
  async function runWorkflow(
    simAws: SimAws,
    state: JSONObject,
    states: JSONObject = {},
    input = '{"student":"Wei"}',
  ): Promise<string> {
    return await statesExecutionFactory.make({ state, states, input }, simAws);
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

  it("answers with one output per branch, in the order they were written", async () => {
    // Given a Parallel state whose first branch waits and whose second does
    // not, so the two finish in the other order.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Settle",
          States: {
            Settle: { Type: "Wait", Seconds: 60, Next: "Enrol" },
            Enrol: { Type: "Pass", Result: { branch: "enrolled" }, End: true },
          },
        },
        answering("Bill", { branch: "billed" }),
      ],
      End: true,
    });

    // When the clock passes what the slow branch is waiting for.
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then the result is an array in branch order rather than in the order
    // the branches finished.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { branch: "enrolled" },
      { branch: "billed" },
    ]);
  });

  it("holds the execution while a branch is waiting on the clock", async () => {
    // Given a Parallel state with a branch that waits.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      {
        Type: "Parallel",
        Branches: [
          {
            StartAt: "Settle",
            States: {
              Settle: { Type: "Wait", Seconds: 300, Next: "Enrol" },
              Enrol: { Type: "Pass", End: true },
            },
          },
          echoing("Bill"),
        ],
        Next: "Confirm",
      },
      { Confirm: { Type: "Succeed" } },
    );

    // When the execution is read back before the clock has moved.
    const waiting = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then it is still running, and the state after the Parallel has not been
    // reached.
    assertIdentical(waiting.status, "RUNNING");
    assertObjectEquals(
      simAws.stepFunctions().inspection().visitedStates(executionArn),
      ["Check"],
    );
  });

  it("waits for the last of several branches on the clock", async () => {
    // Given two branches waiting for different instants.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Settle",
          States: {
            Settle: { Type: "Wait", Seconds: 60, Next: "Enrol" },
            Enrol: { Type: "Pass", Result: { branch: "enrolled" }, End: true },
          },
        },
        {
          StartAt: "Invoice",
          States: {
            Invoice: { Type: "Wait", Seconds: 120, Next: "Bill" },
            Bill: { Type: "Pass", Result: { branch: "billed" }, End: true },
          },
        },
      ],
      End: true,
    });

    // When the clock passes the first wait but not the second.
    await simAws.clock().advanceBy({ seconds: 90 });

    const waiting = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    // Then the state is still going, and finishes once the second is up.
    assertIdentical(waiting.status, "RUNNING");

    await simAws.clock().advanceBy({ seconds: 60 });

    assertObjectEquals(await outputOf(simAws, executionArn), [
      { branch: "enrolled" },
      { branch: "billed" },
    ]);
  });

  it("fails the state where the branch outputs have nowhere to go", async () => {
    // Given a ResultPath writing into a field that holds a string, on a state
    // whose branch finishes on the clock rather than straight away.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Settle",
          States: {
            Settle: { Type: "Wait", Seconds: 60, Next: "Enrol" },
            Enrol: { Type: "Pass", End: true },
          },
        },
      ],
      ResultPath: "$.student.outcomes",
      End: true,
    });

    // When the clock releases the branch.
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then the state failed rather than the clock advance raising.
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn } });

    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.ResultPathMatchFailure");
  });

  it("gives every branch the same effective input", async () => {
    // Given a Parallel state whose Parameters build what the branches read.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      {
        Type: "Parallel",
        InputPath: "$.enrolment",
        Parameters: { "student.$": "$.student", term: 3 },
        Branches: [echoing("Enrol"), echoing("Bill")],
        End: true,
      },
      {},
      '{"enrolment":{"student":"Wei"}}',
    );

    // When it runs, both branches were given what the state's own input and
    // parameter fields produced, once rather than per branch.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      { student: "Wei", term: 3 },
      { student: "Wei", term: 3 },
    ]);
  }, 10_000);

  it("shapes the array of branch outputs with the data-flow fields", async () => {
    // Given a Parallel state that keeps its result beside its own input.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        answering("Enrol", { enrolled: true }),
        answering("Bill", { billed: true }),
      ],
      ResultPath: "$.outcomes",
      End: true,
    });

    // When it runs, ResultPath wrote the whole array into the input.
    assertObjectEquals(await outputOf(simAws, executionArn), {
      student: "Wei",
      outcomes: [{ enrolled: true }, { billed: true }],
    });
  });

  it("reports what each branch did apart from the states around it", async () => {
    // Given a Parallel state whose branches visit states of their own.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(
      simAws,
      {
        Type: "Parallel",
        Branches: [
          {
            StartAt: "Enrol",
            States: {
              Enrol: { Type: "Pass", Next: "Register" },
              Register: { Type: "Pass", End: true },
            },
          },
          echoing("Bill"),
        ],
        Next: "Confirm",
      },
      { Confirm: { Type: "Succeed" } },
    );

    // When the inspection accessor is read.
    const inspection = simAws.stepFunctions().inspection();
    const branches = inspection.branches(executionArn);

    // Then the execution visited the states around the Parallel state, and
    // each branch reports its own.
    assertObjectEquals(inspection.visitedStates(executionArn), [
      "Check",
      "Confirm",
    ]);
    assertArrayLength(branches, 2);
    assertObjectEquals(
      branches.map((branch) => branch.visitedStates),
      [["Enrol", "Register"], ["Bill"]],
    );
    assertObjectEquals(
      branches.map((branch) => ({
        index: branch.index,
        kind: branch.kind,
        stateName: branch.stateName,
        status: branch.status,
      })),
      [
        {
          index: 0,
          kind: "branch",
          stateName: "Check",
          status: "SUCCEEDED",
        },
        {
          index: 1,
          kind: "branch",
          stateName: "Check",
          status: "SUCCEEDED",
        },
      ],
    );
  });

  it("runs a Parallel state inside a branch, and reports both", async () => {
    // Given a branch that fans out again.
    const simAws = new SimAws();
    const executionArn = await runWorkflow(simAws, {
      Type: "Parallel",
      Branches: [
        {
          StartAt: "Split",
          States: {
            Split: {
              Type: "Parallel",
              Branches: [
                answering("Enrol", { enrolled: true }),
                answering("Bill", { billed: true }),
              ],
              End: true,
            },
          },
        },
      ],
      End: true,
    });

    // When it runs, the nested branches are reported on the execution
    // alongside the one holding them.
    assertObjectEquals(await outputOf(simAws, executionArn), [
      [{ enrolled: true }, { billed: true }],
    ]);
    assertObjectEquals(
      simAws
        .stepFunctions()
        .inspection()
        .branches(executionArn)
        .map((branch) => ({ state: branch.stateName, index: branch.index })),
      [
        { state: "Check", index: 0 },
        { state: "Split", index: 0 },
        { state: "Split", index: 1 },
      ],
    );
  });
});
