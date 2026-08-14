import {
  DescribeTaskDefinitionCommand,
  RegisterTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimEcsClientException,
  SimEcsInvalidParameterException,
} from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

async function simAwsWithTwoRevisions(): Promise<SimAws> {
  const simAws = new SimAws();
  await simEcsRegisteredTaskDefinitionFactory.make(
    { image: "checkout:1" },
    simAws,
  );
  await simEcsRegisteredTaskDefinitionFactory.make(
    { image: "checkout:2" },
    simAws,
  );

  return simAws;
}

describe("ECS DescribeTaskDefinitionCommand", () => {
  it("resolves a family alone to its latest active revision", async () => {
    // Given a family with two revisions registered.
    const simAws = await simAwsWithTwoRevisions();

    // When the family is described by name alone.
    const described = await simAws
      .ecs()
      .describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
      );

    // Then the newest revision answers.
    assertIdentical(described.taskDefinition?.revision, 2);
    assertIdentical(
      described.taskDefinition.containerDefinitions?.[0]?.image,
      "checkout:2",
    );
  });

  it("resolves a family and revision to that revision", async () => {
    // Given a family with two revisions registered.
    const simAws = await simAwsWithTwoRevisions();

    // When an earlier revision is named.
    const described = await simAws
      .ecs()
      .describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // Then that revision answers rather than the newest.
    assertIdentical(described.taskDefinition?.revision, 1);
    assertIdentical(
      described.taskDefinition.containerDefinitions?.[0]?.image,
      "checkout:1",
    );
  });

  it("resolves a full task definition ARN", async () => {
    // Given a registered revision and the ARN it was given.
    const simAws = new SimAws();
    const registered = await simEcsRegisteredTaskDefinitionFactory.make(
      {},
      simAws,
    );

    // When that ARN is described.
    const described = await simAws.ecs().describeTaskDefinition(
      new DescribeTaskDefinitionCommand({
        taskDefinition: registered.taskDefinitionArn,
      }),
    );

    // Then the same revision answers.
    assertIdentical(
      described.taskDefinition?.taskDefinitionArn,
      registered.taskDefinitionArn,
    );
  });

  it("reports tags only where the request asked for them", async () => {
    // Given a revision registered with tags.
    const simEcs = new SimAws().ecs();
    await simEcs.registerTaskDefinition(
      new RegisterTaskDefinitionCommand({
        family: "checkout",
        containerDefinitions: [{ name: "app", image: "checkout:1" }],
        tags: [{ key: "team", value: "payments" }],
      }),
    );

    // When it is described with and without asking for tags.
    const withoutTags = await simEcs.describeTaskDefinition(
      new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
    );
    const withTags = await simEcs.describeTaskDefinition(
      new DescribeTaskDefinitionCommand({
        taskDefinition: "checkout",
        include: ["TAGS"],
      }),
    );

    // Then only the request that asked gets them.
    assertArrayLength(withoutTags.tags, 0);
    assertArrayLength(withTags.tags, 1);
    assertIdentical(withTags.tags[0].key, "team");
  });

  it("refuses an include value this operation does not take", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When it is described asking for something other than tags.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().describeTaskDefinition({
        input: { taskDefinition: "checkout", include: ["SETTINGS"] },
      }),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "Only TAGS is");
  });

  it("refuses a family that has never been registered", async () => {
    // Given simulated ECS holding nothing.
    const simEcs = new SimAws().ecs();

    // When an unregistered family is described.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
      ),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "Unable to describe task definition");
  });

  it("refuses a request naming no task definition", async () => {
    // Given simulated ECS.
    const simEcs = new SimAws().ecs();

    // When nothing is named.
    const error = await assertThrowsErrorAsync(async () =>
      simEcs.describeTaskDefinition({ input: {} }),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "is required");
  });

  it("refuses a revision that is not a whole number", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a revision that is not a number is named.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeTaskDefinition(
          new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:one" }),
        ),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "a whole number from 1");
  });

  it("refuses an ARN belonging to another account", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When an ARN in a different account is described.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().describeTaskDefinition(
        new DescribeTaskDefinitionCommand({
          taskDefinition:
            "arn:aws:ecs:eu-west-2:999999999999:task-definition/checkout:1",
        }),
      ),
    );

    // Then it names a task definition somewhere else, so nothing answers.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "does not name a task definition");
  });

  it("refuses an ARN that is not a task definition", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a cluster ARN is described as a task definition.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().describeTaskDefinition(
        new DescribeTaskDefinitionCommand({
          taskDefinition: `arn:aws:ecs:${simAws.defaultRegionName}:${simAws.defaultAccountId}:cluster/checkout`,
        }),
      ),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "does not name a task definition");
  });
});
