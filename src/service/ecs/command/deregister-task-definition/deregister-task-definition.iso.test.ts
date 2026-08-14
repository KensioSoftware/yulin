import {
  DeregisterTaskDefinitionCommand,
  DescribeTaskDefinitionCommand,
} from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsClientException } from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

describe("ECS DeregisterTaskDefinitionCommand", () => {
  it("marks a revision inactive without removing it", async () => {
    // Given a registered revision.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-05-06T07:08:09Z")),
    });
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When it is deregistered.
    const deregistered = await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // Then it is reported as INACTIVE, and it is still describable.
    assertIdentical(deregistered.taskDefinition?.status, "INACTIVE");
    assertIdentical(
      deregistered.taskDefinition.deregisteredAt?.toISOString(),
      "2026-05-06T07:08:09.000Z",
    );

    const described = await simAws
      .ecs()
      .describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    assertIdentical(described.taskDefinition?.status, "INACTIVE");
  });

  it("stops a deregistered revision being the latest active one", async () => {
    // Given a family with two revisions registered.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make(
      { image: "checkout:1" },
      simAws,
    );
    await simEcsRegisteredTaskDefinitionFactory.make(
      { image: "checkout:2" },
      simAws,
    );

    // When the newest revision is deregistered.
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:2" }),
      );

    // Then the family resolves to the revision before it.
    const described = await simAws
      .ecs()
      .describeTaskDefinition(
        new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
      );

    assertIdentical(described.taskDefinition?.revision, 1);
  });

  it("leaves the revision numbering where it was", async () => {
    // Given a registered revision that has been deregistered.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // When the family is registered again.
    const registered = await simEcsRegisteredTaskDefinitionFactory.make(
      {},
      simAws,
    );

    // Then the new revision is 2, since a number is never reused.
    assertIdentical(registered.revision, 2);
  });

  it("refuses a family with no active revision left", async () => {
    // Given a family whose only revision has been deregistered.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // When the family is described by name alone.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .describeTaskDefinition(
          new DescribeTaskDefinitionCommand({ taskDefinition: "checkout" }),
        ),
    );

    // Then there is nothing for it to resolve to.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "with an active revision");
  });

  it("deregisters a revision named by its ARN", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    const registered = await simEcsRegisteredTaskDefinitionFactory.make(
      {},
      simAws,
    );

    // When it is deregistered by ARN.
    const deregistered = await simAws.ecs().deregisterTaskDefinition(
      new DeregisterTaskDefinitionCommand({
        taskDefinition: registered.taskDefinitionArn,
      }),
    );

    // Then that revision is the one marked inactive.
    assertIdentical(deregistered.taskDefinition?.status, "INACTIVE");
  });

  it("leaves a deregistration instant where the first request set it", async () => {
    // Given a revision that has already been deregistered.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);
    const first = await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // When it is deregistered again.
    const second = await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // Then the instant belongs to the deregistration that did it.
    assertNonNullable(first.taskDefinition?.deregisteredAt);
    assertIdentical(
      second.taskDefinition?.deregisteredAt?.toISOString(),
      first.taskDefinition.deregisteredAt.toISOString(),
    );
  });

  it("refuses a family named without a revision", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When the family alone is deregistered.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .deregisterTaskDefinition(
          new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout" }),
        ),
    );

    // Then ECS refuses it, because deregistering is done to one revision.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "needs one revision");
  });

  it("refuses a revision that was never registered", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a revision that does not exist is deregistered.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .ecs()
        .deregisterTaskDefinition(
          new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:9" }),
        ),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsClientException);
    assertStringIncludes(error.message, "checkout:9");
  });
});
