import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  DescribeStateMachineCommand,
  ListStateMachinesCommand,
  SFNClient,
  StartExecutionCommand,
  UpdateStateMachineCommand,
} from "@aws-sdk/client-sfn";
import {
  assertArrayEmpty,
  assertArrayIncludesAll,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";
import { SimAws } from "../../aws/sim-aws.js";

const definition = JSON.stringify({
  StartAt: "Check",
  States: {
    Check: { Type: "Pass", Result: { eligible: true }, Next: "Done" },
    Done: { Type: "Succeed" },
  },
});

describe("Simulated Step Functions SDK interception", () => {
  it("runs a state machine through an intercepted SFNClient", async () => {
    // Given an intercepted client.
    const simAws = new SimAws();
    const client = new SFNClient({ region: "eu-west-2" });

    using _intercepted = new SimSdk({ simAws }).intercept(client);

    // When a state machine is created and run through the SDK.
    const created = await client.send(
      new CreateStateMachineCommand({
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition,
      }),
    );

    assertNonNullable(created.stateMachineArn);

    const started = await client.send(
      new StartExecutionCommand({
        stateMachineArn: created.stateMachineArn,
        input: '{"student":"Wei"}',
      }),
    );

    assertNonNullable(started.executionArn);

    const described = await client.send(
      new DescribeExecutionCommand({ executionArn: started.executionArn }),
    );

    // Then the execution ran against the simulated service.
    assertIdentical(described.status, "SUCCEEDED");
    assertIdentical(described.output, '{"eligible":true}');
  });

  it("reads back through the simulator what the SDK created", async () => {
    // Given a client in the simulation's own default Region, so the SDK and
    // the accessor reach the same scoped service.
    const simAws = new SimAws();
    const client = new SFNClient({ region: simAws.defaultRegionName });

    using _intercepted = new SimSdk({ simAws }).intercept(client);

    await client.send(
      new CreateStateMachineCommand({
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition,
      }),
    );

    // When it is listed through the SDK and found through the simulator.
    const listed = await client.send(new ListStateMachinesCommand({}));

    // Then both reach the same state machine.
    assertArrayLength(listed.stateMachines ?? [], 1);
    assertNonNullable(simAws.stepFunctions().findStateMachine("Enrolment"));
  });

  it("routes every state machine command it says it supports", async () => {
    // Given an intercepted client.
    const simAws = new SimAws();
    const client = new SFNClient({ region: simAws.defaultRegionName });

    using _intercepted = new SimSdk({ simAws }).intercept(client);

    const created = await client.send(
      new CreateStateMachineCommand({
        name: "Enrolment",
        roleArn: "arn:aws:iam::123456789012:role/WorkflowRole",
        definition,
      }),
    );

    assertNonNullable(created.stateMachineArn);

    // When the rest of the state machine commands go through the SDK.
    const described = await client.send(
      new DescribeStateMachineCommand({
        stateMachineArn: created.stateMachineArn,
      }),
    );
    const updated = await client.send(
      new UpdateStateMachineCommand({
        stateMachineArn: created.stateMachineArn,
        roleArn: "arn:aws:iam::123456789012:role/Another",
      }),
    );
    await client.send(
      new DeleteStateMachineCommand({
        stateMachineArn: created.stateMachineArn,
      }),
    );
    const listed = await client.send(new ListStateMachinesCommand({}));

    // Then each answered, and the delete left nothing behind.
    assertIdentical(described.name, "Enrolment");
    assertNonNullable(updated.updateDate);
    assertArrayEmpty(listed.stateMachines ?? []);
  });

  it("names the commands it routes", () => {
    // Given a simulated Step Functions.
    const simAws = new SimAws();

    // When its router is asked what it supports.
    const supported = simAws
      .stepFunctions()
      .sdkCommandRouter()
      .supportedCommandNames();

    // Then every command this service handles is named.
    assertArrayIncludesAll(supported, [
      "CreateStateMachineCommand",
      "DescribeStateMachineCommand",
      "UpdateStateMachineCommand",
      "DeleteStateMachineCommand",
      "ListStateMachinesCommand",
      "StartExecutionCommand",
      "DescribeExecutionCommand",
    ]);
  });
});
