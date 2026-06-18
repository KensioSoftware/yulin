import { describe, it } from "vitest";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertMapSize,
  assertInstanceOf,
} from "@kensio/smartass";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFormationAlreadyExistsException } from "../../error/sim-cloudfront.error.js";

describe("CloudFormation CreateStackCommand", () => {
  it("creates a CloudFormation Stack from a template body", async () => {
    // Given a CloudFormation service ready to create a Stack.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    // When CreateStackCommand is handled with a StackName and TemplateBody.
    const createStackOutput = await cloudFormation.createStack({
      input: {
        StackName: "test-stack",
        TemplateBody: JSON.stringify({}),
      },
    });

    // Then the Stack is registered and starts deploying in the background.
    assertIdentical(createStackOutput.StackId, "test-stack");

    const describeStacksOut = await cloudFormation.describeStacks({
      input: {
        StackName: "test-stack",
      },
    });

    assertArrayLength(describeStacksOut.Stacks, 1);
    assertIdentical(describeStacksOut.Stacks[0].StackId, "test-stack");
    assertIdentical(describeStacksOut.Stacks[0].StackName, "test-stack");
    assertIdentical(
      describeStacksOut.Stacks[0].StackStatus,
      "CREATE_IN_PROGRESS",
    );
  });

  it("records resources from the parsed template body", async () => {
    // Given a CloudFormation template body containing Resource declarations.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    // When CreateStackCommand is handled with the template body.
    await cloudFormation.createStack({
      input: {
        StackName: "test-stack",
        TemplateBody: JSON.stringify({
          Resources: {
            ExampleResource: {
              Type: "Custom::Example",
              Properties: {
                Value: "example",
              },
            },
          },
        }),
      },
    });

    // Then the Stack records the template Resources by logical ID.
    const stack = cloudFormation.stacks.get("test-stack" as never);

    assertNonNullable(stack);
    assertMapSize(stack.resources, 1);

    const resource = stack.resources.get("ExampleResource");

    assertNonNullable(resource);
    assertIdentical(resource.logicalId, "ExampleResource");
    assertIdentical(resource.template["Type"], "Custom::Example");
  });

  it("completes Stack deployment in background tasks", async () => {
    // Given a CloudFormation Stack created from a CreateStackCommand.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack({
      input: {
        StackName: "test-stack",
        TemplateBody: JSON.stringify({}),
      },
    });

    // When all scheduled background tasks complete.
    await simAws.backgroundTasksComplete();

    // Then the Stack reaches CREATE_COMPLETE status.
    const describeStacksOutput = await cloudFormation.describeStacks({
      input: {
        StackName: "test-stack",
      },
    });

    assertArrayLength(describeStacksOutput.Stacks, 1);
    assertIdentical(
      describeStacksOutput.Stacks[0].StackStatus,
      "CREATE_COMPLETE",
    );
  });

  it("requires a StackName", async () => {
    // Given a CreateStackCommand input without the required StackName.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    // When CreateStackCommand is handled without StackName, then it rejects.
    await assertThrowsErrorAsync(async () =>
      cloudFormation.createStack({
        input: {
          TemplateBody: JSON.stringify({}),
        },
      }),
    );
  });

  it("requires a TemplateBody", async () => {
    // Given a CreateStackCommand input without the required TemplateBody.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    // When CreateStackCommand is handled without TemplateBody, then it rejects.
    await assertThrowsErrorAsync(async () =>
      cloudFormation.createStack({
        input: {
          StackName: "test-stack",
        },
      }),
    );
  });

  it("throws AlreadyExistsException when StackName already exists", async () => {
    // Given a CloudFormation Stack already exists.
    const simAws = new SimAws();

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.createStack({
      input: {
        StackName: "test-stack",
        TemplateBody: JSON.stringify({}),
      },
    });

    // When CreateStackCommand is handled with the same StackName, then it rejects
    // with the SDK-shaped AlreadyExistsException.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.createStack({
        input: {
          StackName: "test-stack",
          TemplateBody: JSON.stringify({}),
        },
      }),
    );

    assertInstanceOf(error, SimCloudFormationAlreadyExistsException);
    assertIdentical(error.name, "AlreadyExistsException");
    assertIdentical(error.$fault, "client");
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });
});
