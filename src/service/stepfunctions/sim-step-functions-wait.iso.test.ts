import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";

describe("Simulated Step Functions Wait states", () => {
  const startedAt = "2026-07-26T09:00:00.000Z";

  /**
   * A simulation whose clock stands at a known instant, holding a state
   * machine written as an object.
   */
  async function givenAStateMachine(
    states: object,
  ): Promise<{ readonly simAws: SimAws; readonly stateMachineArn: string }> {
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date(startedAt)),
    });
    const created = await simAws.stepFunctions().createStateMachine({
      input: {
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition: JSON.stringify({ StartAt: "Hold", States: states }),
      },
    });

    return { simAws, stateMachineArn: created.stateMachineArn };
  }

  it("holds an execution RUNNING for as long as the clock stands still", async () => {
    // Given a state machine waiting five minutes.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Seconds: 300, Next: "Done" },
      Done: { Type: "Succeed" },
    });

    // When an execution is started and read back twice under a frozen clock.
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: '{"term":3}' } });
    const first = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });
    const second = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it is still waiting, however long the test itself takes.
    assertIdentical(first.status, "RUNNING");
    assertIdentical(second.status, "RUNNING");
    assertArrayEquals(
      simAws.stepFunctions().inspection().visitedStates(started.executionArn),
      ["Hold"],
    );
  });

  it("runs the rest of the execution once time reaches the wait", async () => {
    // Given the same state machine, with an execution waiting on it.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Seconds: 300, Next: "Done" },
      Done: { Type: "Pass", Result: { enrolled: true }, End: true },
    });
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: '{"term":3}' } });

    // When simulated time passes the instant it is waiting for.
    await simAws.clock().advanceBy({ minutes: 6 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution finished, and it stopped at the instant the wait was
    // over rather than at the instant the clock reached.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"enrolled":true}');
    assertIdentical(
      described.stopDate?.toISOString(),
      "2026-07-26T09:05:00.000Z",
    );
  });

  it("waits again where the execution reaches a second Wait", async () => {
    // Given a state machine waiting twice, reading the second wait from its
    // input.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Seconds: 60, Next: "HoldAgain" },
      HoldAgain: { Type: "Wait", SecondsPath: "$.again", Next: "Done" },
      Done: { Type: "Succeed" },
    });
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: '{"again":600}' } });

    // When time passes the first wait but not the second.
    await simAws.clock().advanceBy({ minutes: 2 });

    const between = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it is waiting again, and moves on once time reaches that one too.
    assertIdentical(between.status, "RUNNING");
    assertArrayEquals(
      simAws.stepFunctions().inspection().visitedStates(started.executionArn),
      ["Hold", "HoldAgain"],
    );

    await simAws.clock().advanceBy({ minutes: 10 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    assertIdentical(described.status, "SUCCEEDED");
  });

  it("leaves advanceBy returning normally where the execution then fails", async () => {
    // Given a state machine that waits and then fails.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Timestamp: "2026-07-26T10:00:00Z", Next: "Give" },
      Give: { Type: "Fail", Error: "NoPlaceLeft", Cause: "The term is full" },
    });
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn } });

    // When time passes the instant it is waiting for.
    await simAws.clock().advanceBy({ hours: 2 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then advancing the clock returned as it would for an execution that
    // succeeded, and the failure is on the execution.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "NoPlaceLeft");
    assertIdentical(described.cause, "The term is full");
  });

  it("holds nothing up where the instant waited for has already passed", async () => {
    // Given a Wait state whose Timestamp is behind the clock.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: {
        Type: "Wait",
        TimestampPath: "$.closesAt",
        Next: "Done",
      },
      Done: { Type: "Succeed" },
    });

    // When an execution runs.
    const started = await simAws.stepFunctions().startExecution({
      input: {
        stateMachineArn,
        input: '{"closesAt":"2026-07-26T08:00:00Z"}',
      },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then it finished in the StartExecution call, with nothing to wait for.
    assertIdentical(described.status, "SUCCEEDED");
  });

  it("ends the execution at a Wait state that carries End", async () => {
    // Given a Wait state that is the last state in the machine.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Seconds: 30, End: true },
    });
    const started = await simAws
      .stepFunctions()
      .startExecution({ input: { stateMachineArn, input: '{"term":3}' } });

    // When time passes the wait.
    await simAws.clock().advanceBy({ minutes: 1 });

    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution ended there, carrying what reached the Wait state.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"term":3}');
  });

  it("fails an execution whose wait path holds no duration", async () => {
    // Given a Wait state reading its duration from the input.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", SecondsPath: "$.after", Next: "Done" },
      Done: { Type: "Succeed" },
    });

    // When an execution runs on an input holding something else there.
    const started = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, input: '{"after":"soon"}' },
    });
    const described = await simAws
      .stepFunctions()
      .describeExecution({ input: { executionArn: started.executionArn } });

    // Then the execution failed rather than waiting for an instant it could
    // not work out.
    assertIdentical(described.status, "FAILED");
    assertIdentical(described.error, "States.Runtime");
  });

  it("answers a repeated start with the execution already running", async () => {
    // Given a named execution that is waiting on the clock.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Seconds: 300, Next: "Done" },
      Done: { Type: "Succeed" },
    });
    const first = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, name: "enrol-wei", input: '{"term":3}' },
    });

    // When the same start is made again.
    const second = await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, name: "enrol-wei", input: '{"term":3}' },
    });

    // Then it answers with the execution already there rather than starting a
    // second one.
    assertIdentical(second.executionArn, first.executionArn);
    assertArrayEquals(
      simAws.stepFunctions().inspection().executionsOf(stateMachineArn),
      [first.executionArn],
    );
  });

  it("refuses a repeated start that carries different input", async () => {
    // Given a named execution that is waiting on the clock.
    const { simAws, stateMachineArn } = await givenAStateMachine({
      Hold: { Type: "Wait", Seconds: 300, Next: "Done" },
      Done: { Type: "Succeed" },
    });

    await simAws.stepFunctions().startExecution({
      input: { stateMachineArn, name: "enrol-wei", input: '{"term":3}' },
    });

    // When a start of the same name carries something else.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.stepFunctions().startExecution({
          input: { stateMachineArn, name: "enrol-wei", input: '{"term":1}' },
        }),
    );

    // Then the name is taken, rather than the running execution being handed
    // back for input it never ran on.
    assertStringIncludes(error.message, "already has an execution");
  });
});
