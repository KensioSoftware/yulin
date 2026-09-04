import { describe, it } from "vitest";
import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNotEqual,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUuidV4,
} from "@kensio/smartass";
import {
  CreateChangeSetCommand,
  CreateStackCommand,
  DeleteStackCommand,
  DescribeChangeSetCommand,
  DescribeStacksCommand,
} from "@aws-sdk/client-cloudformation";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsAccountRegionScopeFactory } from "../../aws/sim-aws-account-region-scope.factory.js";
import { SimCloudFormationValidationError } from "../error/sim-cloudformation.error.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

describe("sim CloudFormation Stack IDs", () => {
  it("gives a created Stack an ARN Stack ID in its own scope", async () => {
    // Given a simulated CloudFormation in an Account and Region of its own.
    const { accountId, regionName } = simAwsAccountRegionScopeFactory.make();
    const simAws = new SimAws();
    const cloudFormation = simAws
      .account(accountId)
      .region(regionName)
      .cloudFormation();
    const stackName = `orders-${faker.string.alphanumeric(8)}`;

    // When a Stack is created there.
    const stackCreation = await cloudFormation.createStack(
      new CreateStackCommand({
        StackName: stackName,
        TemplateBody: jsonStringify({ Resources: {} }),
      }),
    );

    // Then it was given the ARN CloudFormation shapes a Stack ID as, naming
    // the Account and Region it was created in, and DescribeStacks reports it.
    const stackIdPrefix = `arn:aws:cloudformation:${regionName}:${accountId}:stack/${stackName}/`;

    assertStringStartsWith(stackCreation.StackId, stackIdPrefix);
    assertUuidV4(stackCreation.StackId.slice(stackIdPrefix.length));

    const described = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: stackName }),
    );

    assertArrayLength(described.Stacks, 1);
    assertIdentical(described.Stacks[0].StackId, stackCreation.StackId);
  });

  it("gives a Stack deployed again under a freed name a new Stack ID", async () => {
    // Given a Stack that was deployed, deleted, and deployed again as itself.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stackName = `billing-${faker.string.alphanumeric(8)}`;
    const template = jsonStringify({ Resources: {} });

    const firstDeployment = await cloudFormation.createStack(
      new CreateStackCommand({ StackName: stackName, TemplateBody: template }),
    );

    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: stackName }),
    );
    await simAws.backgroundTasksComplete();

    // When the freed name is used again.
    const secondDeployment = await cloudFormation.createStack(
      new CreateStackCommand({ StackName: stackName, TemplateBody: template }),
    );

    // Then the second Stack is a different Stack, rather than the first one
    // under a name it happens to share.
    assertNotEqual(secondDeployment.StackId, firstDeployment.StackId);
  });

  it("resolves AWS::StackId to the Stack ID and AWS::StackName to the name", async () => {
    // Given a template reading both of the pseudo parameters that name a Stack.
    const simAws = new SimAws();
    const stackName = `catalogue-${faker.string.alphanumeric(8)}`;

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName,
      template: {
        Resources: {
          Handle: { Type: "AWS::CloudFormation::WaitConditionHandle" },
        },
        Outputs: {
          Id: { Value: { Ref: "AWS::StackId" } },
          Name: { Value: { Ref: "AWS::StackName" } },
        },
      },
    });

    // Then the two resolve to different things, where they used to be the same
    // value under two names.
    assertIdentical(stack.output("Id"), stack.stackId);
    assertIdentical(stack.output("Name"), stackName);
  });

  it("gives the Stack a CREATE change set reviews its Stack ID", async () => {
    // Given a change set that brings a Stack into being in review.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stackName = `planned-${faker.string.alphanumeric(8)}`;

    const changeSet = await cloudFormation.createChangeSet(
      new CreateChangeSetCommand({
        StackName: stackName,
        ChangeSetName: "first-plan",
        ChangeSetType: "CREATE",
        TemplateBody: jsonStringify({
          Resources: {},
          Outputs: { Id: { Value: { Ref: "AWS::StackId" } } },
        }),
      }),
    );

    // When the Stack the change set is held against is described.
    const described = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: stackName }),
    );

    // Then the change set and the Stack in review name the same Stack ID.
    assertStringIncludes(changeSet.StackId, `:stack/${stackName}/`);
    assertArrayLength(described.Stacks, 1);
    assertIdentical(described.Stacks[0].StackId, changeSet.StackId);

    const describedChangeSet = await cloudFormation.describeChangeSet(
      new DescribeChangeSetCommand({
        StackName: stackName,
        ChangeSetName: "first-plan",
      }),
    );

    assertIdentical(describedChangeSet.StackId, changeSet.StackId);
  });

  it("describes a live Stack by its Stack ID", async () => {
    // Given a deployed Stack, alongside another that could be answered instead.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();

    const stack = await cloudFormation.deployTemplate({
      stackName: `reports-${faker.string.alphanumeric(8)}`,
      template: { Resources: {} },
    });
    await cloudFormation.deployTemplate({
      stackName: `reports-${faker.string.alphanumeric(8)}`,
      template: { Resources: {} },
    });

    // When DescribeStacks is given the Stack ID rather than the Stack name.
    const described = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: stack.stackId }),
    );

    // Then it describes that Stack.
    assertArrayLength(described.Stacks, 1);
    assertIdentical(described.Stacks[0].StackName, stack.stackName);
    assertIdentical(described.Stacks[0].StackId, stack.stackId);
  });

  it("describes a deleted Stack by its Stack ID", async () => {
    // Given a Stack with an Output that has finished deleting.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stackName = `archive-${faker.string.alphanumeric(8)}`;
    const queueName = `archive-queue-${faker.string.alphanumeric(8)}`;

    const stack = await cloudFormation.deployTemplate({
      stackName,
      template: {
        Resources: {
          Queue: {
            Type: "AWS::SQS::Queue",
            Properties: { QueueName: queueName },
          },
        },
        Outputs: { QueueUrl: { Value: { Ref: "Queue" } } },
      },
    });

    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: stackName }),
    );
    await simAws.backgroundTasksComplete();

    // When DescribeStacks is given the Stack ID it was deleted under.
    const described = await cloudFormation.describeStacks(
      new DescribeStacksCommand({ StackName: stack.stackId }),
    );

    // Then the Stack is still readable, with what it finished with.
    assertArrayLength(described.Stacks, 1);
    assertIdentical(described.Stacks[0].StackStatus, "DELETE_COMPLETE");
    assertIdentical(described.Stacks[0].StackName, stackName);
    assertArrayLength(described.Stacks[0].Outputs, 1);
    assertStringIncludes(described.Stacks[0].Outputs[0].OutputValue, queueName);
  });

  it("refuses to describe a deleted Stack by name", async () => {
    // Given a Stack that has finished deleting, so its name is free again.
    const simAws = new SimAws();
    const cloudFormation = simAws.cloudFormation();
    const stackName = `retired-${faker.string.alphanumeric(8)}`;

    await cloudFormation.deployTemplate({
      stackName,
      template: { Resources: {} },
    });
    await cloudFormation.deleteStack(
      new DeleteStackCommand({ StackName: stackName }),
    );
    await simAws.backgroundTasksComplete();

    // When DescribeStacks is given the name rather than the Stack ID, then it
    // is refused the way a name that never existed is.
    const error = await assertThrowsErrorAsync(async () =>
      cloudFormation.describeStacks(
        new DescribeStacksCommand({ StackName: stackName }),
      ),
    );

    assertInstanceOf(error, SimCloudFormationValidationError);
    assertIdentical(error.message, `Stack with id ${stackName} does not exist`);
  });
});
