import {
  DeregisterTaskDefinitionCommand,
  ListTaskDefinitionsCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimEcsInvalidParameterException } from "../../error/sim-ecs.error.js";
import { simEcsRegisteredTaskDefinitionFactory } from "../../task-definition/sim-ecs-registered-task-definition.factory.js";

async function simAwsWithTwoFamilies(): Promise<SimAws> {
  const simAws = new SimAws();
  await simEcsRegisteredTaskDefinitionFactory.make(
    { family: "checkout" },
    simAws,
  );
  await simEcsRegisteredTaskDefinitionFactory.make(
    { family: "checkout" },
    simAws,
  );
  await simEcsRegisteredTaskDefinitionFactory.make(
    { family: "billing" },
    simAws,
  );

  return simAws;
}

describe("ECS ListTaskDefinitionsCommand", () => {
  it("lists every active revision by family and then revision", async () => {
    // Given two families, one with two revisions.
    const simAws = await simAwsWithTwoFamilies();

    // When the task definitions are listed.
    const listed = await simAws
      .ecs()
      .listTaskDefinitions(new ListTaskDefinitionsCommand({}));

    // Then they come out in ascending family and revision order.
    assertArrayLength(listed.taskDefinitionArns, 3);
    assertStringIncludes(listed.taskDefinitionArns[0], "billing:1");
    assertStringIncludes(listed.taskDefinitionArns[1], "checkout:1");
    assertStringIncludes(listed.taskDefinitionArns[2], "checkout:2");
  });

  it("lists one family where a prefix asks for it", async () => {
    // Given two families.
    const simAws = await simAwsWithTwoFamilies();

    // When a family prefix is given.
    const listed = await simAws
      .ecs()
      .listTaskDefinitions(
        new ListTaskDefinitionsCommand({ familyPrefix: "check" }),
      );

    // Then only that family's revisions are listed.
    assertArrayLength(listed.taskDefinitionArns, 2);
    assertStringIncludes(listed.taskDefinitionArns[0], "checkout:1");
  });

  it("lists newest first where the request sorts descending", async () => {
    // Given two families.
    const simAws = await simAwsWithTwoFamilies();

    // When the listing sorts descending.
    const listed = await simAws
      .ecs()
      .listTaskDefinitions(new ListTaskDefinitionsCommand({ sort: "DESC" }));

    // Then the order is reversed.
    assertArrayLength(listed.taskDefinitionArns, 3);
    assertStringIncludes(listed.taskDefinitionArns[0], "checkout:2");
  });

  it("lists the inactive revisions where the request asks", async () => {
    // Given a family with one of its revisions deregistered.
    const simAws = await simAwsWithTwoFamilies();
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "checkout:1" }),
      );

    // When active and inactive revisions are listed in turn.
    const active = await simAws
      .ecs()
      .listTaskDefinitions(new ListTaskDefinitionsCommand({}));
    const inactive = await simAws
      .ecs()
      .listTaskDefinitions(
        new ListTaskDefinitionsCommand({ status: "INACTIVE" }),
      );

    // Then the deregistered revision has moved from one listing to the other.
    assertArrayLength(active.taskDefinitionArns, 2);
    assertArrayLength(inactive.taskDefinitionArns, 1);
    assertStringIncludes(inactive.taskDefinitionArns[0], "checkout:1");
  });

  it("pages a listing at the size the request asked for", async () => {
    // Given three revisions.
    const simAws = await simAwsWithTwoFamilies();

    // When they are listed two at a time.
    const first = await simAws
      .ecs()
      .listTaskDefinitions(new ListTaskDefinitionsCommand({ maxResults: 2 }));
    const second = await simAws.ecs().listTaskDefinitions(
      new ListTaskDefinitionsCommand({
        maxResults: 2,
        nextToken: first.nextToken,
      }),
    );

    // Then the pages carry the revisions between them.
    assertArrayLength(first.taskDefinitionArns, 2);
    assertArrayLength(second.taskDefinitionArns, 1);
    assertUndefined(second.nextToken);
  });

  it("refuses a status this operation does not take", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a listing asks for a status ECS has no such value for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().listTaskDefinitions({ input: { status: "ALL" } }),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "ACTIVE and INACTIVE are");
  });

  it("refuses a sort order this operation does not take", async () => {
    // Given a registered revision.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a listing asks for an order ECS has no such value for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().listTaskDefinitions({ input: { sort: "NEWEST" } }),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "ASC and DESC are");
  });
});
