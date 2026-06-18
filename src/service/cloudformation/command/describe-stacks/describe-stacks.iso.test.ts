import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertUndefined,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  CreateStackCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";

describe("CloudFormation DescribeStacksCommand", () => {
  it("describes all CloudFormation Stacks", async () => {
    // Given a CloudFormation service with multiple existing Stacks.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "stack-a",
        TemplateBody: JSON.stringify({}),
      }),
    );
    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "stack-b",
        TemplateBody: JSON.stringify({}),
      }),
    );
    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "stack-c",
        TemplateBody: JSON.stringify({}),
      }),
    );

    // When DescribeStacksCommand is handled without a StackName filter.
    const describeStacksOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand(),
    );

    // Then all existing Stacks are returned in creation order.
    assertArrayLength(describeStacksOutput.Stacks, 3);

    assertIdentical(describeStacksOutput.Stacks[0].StackId, "stack-a");
    assertIdentical(describeStacksOutput.Stacks[0].StackName, "stack-a");
    assertIdentical(
      describeStacksOutput.Stacks[0].StackStatus,
      "CREATE_IN_PROGRESS",
    );

    assertIdentical(describeStacksOutput.Stacks[1].StackId, "stack-b");
    assertIdentical(describeStacksOutput.Stacks[1].StackName, "stack-b");
    assertIdentical(
      describeStacksOutput.Stacks[1].StackStatus,
      "CREATE_IN_PROGRESS",
    );

    assertIdentical(describeStacksOutput.Stacks[2].StackId, "stack-c");
    assertIdentical(describeStacksOutput.Stacks[2].StackName, "stack-c");
    assertIdentical(
      describeStacksOutput.Stacks[2].StackStatus,
      "CREATE_IN_PROGRESS",
    );
  });

  it("describes a specific CloudFormation Stack by name", async () => {
    // Given a CloudFormation service with multiple existing Stacks.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "stack-a",
        TemplateBody: JSON.stringify({}),
      }),
    );
    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "stack-b",
        TemplateBody: JSON.stringify({}),
      }),
    );

    // When DescribeStacksCommand is handled with a StackName filter.
    const describeStacksOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({
        StackName: "stack-b",
      }),
    );

    // Then only the matching Stack description is returned.
    assertArrayLength(describeStacksOutput.Stacks, 1);

    assertIdentical(describeStacksOutput.Stacks[0].StackId, "stack-b");
    assertIdentical(describeStacksOutput.Stacks[0].StackName, "stack-b");
    assertIdentical(
      describeStacksOutput.Stacks[0].StackStatus,
      "CREATE_IN_PROGRESS",
    );
  });

  it("describes Stack status after background deployment completes", async () => {
    // Given a CloudFormation Stack whose background deployment has completed.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "test-stack",
        TemplateBody: JSON.stringify({}),
      }),
    );

    await simAws.backgroundTasksComplete();

    // When DescribeStacksCommand is handled for the completed Stack.
    const describeStacksOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({
        StackName: "test-stack",
      }),
    );

    // Then the Stack description includes the completed Stack status.
    assertArrayLength(describeStacksOutput.Stacks, 1);

    assertIdentical(describeStacksOutput.Stacks[0].StackId, "test-stack");
    assertIdentical(describeStacksOutput.Stacks[0].StackName, "test-stack");
    assertIdentical(
      describeStacksOutput.Stacks[0].StackStatus,
      "CREATE_COMPLETE",
    );
  });

  it("returns no Stacks for an unknown Stack name", async () => {
    // Given a CloudFormation service without a Stack matching the requested name.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: "test-stack",
        TemplateBody: JSON.stringify({}),
      }),
    );

    // When DescribeStacksCommand is handled with an unknown StackName filter.
    const describeStacksOutput = await cloudFormation.describeStacks(
      new DescribeStacksCommand({
        StackName: "unknown-stack",
      }),
    );

    // Then an empty Stacks list is returned.
    assertArrayLength(describeStacksOutput.Stacks, 0);
    assertUndefined(describeStacksOutput.Stacks[0]);
  });
});
