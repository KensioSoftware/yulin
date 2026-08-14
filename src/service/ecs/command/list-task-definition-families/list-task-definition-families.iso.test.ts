import {
  DeregisterTaskDefinitionCommand,
  ListTaskDefinitionFamiliesCommand,
} from "@aws-sdk/client-ecs";
import {
  assertArrayLength,
  assertIdentical,
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
    { family: "billing" },
    simAws,
  );

  return simAws;
}

describe("ECS ListTaskDefinitionFamiliesCommand", () => {
  it("lists the families that have been registered", async () => {
    // Given two families.
    const simAws = await simAwsWithTwoFamilies();

    // When the families are listed.
    const listed = await simAws
      .ecs()
      .listTaskDefinitionFamilies(new ListTaskDefinitionFamiliesCommand({}));

    // Then both come back, in the order they were first registered.
    assertArrayLength(listed.families, 2);
    assertIdentical(listed.families[0], "checkout");
    assertIdentical(listed.families[1], "billing");
  });

  it("lists both active and inactive families where none is asked for", async () => {
    // Given a family whose only revision has been deregistered.
    const simAws = await simAwsWithTwoFamilies();
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "billing:1" }),
      );

    // When the families are listed without a status.
    const listed = await simAws
      .ecs()
      .listTaskDefinitionFamilies(new ListTaskDefinitionFamiliesCommand({}));

    // Then both are listed, as real ECS lists them when none is asked for.
    assertArrayLength(listed.families, 2);
  });

  it("lists the families a prefix asks for", async () => {
    // Given two families.
    const simAws = await simAwsWithTwoFamilies();

    // When a family prefix is given.
    const listed = await simAws
      .ecs()
      .listTaskDefinitionFamilies(
        new ListTaskDefinitionFamiliesCommand({ familyPrefix: "bill" }),
      );

    // Then only the matching family is listed.
    assertArrayLength(listed.families, 1);
    assertIdentical(listed.families[0], "billing");
  });

  it("counts a family as inactive once its revisions are gone", async () => {
    // Given a family whose only revision has been deregistered.
    const simAws = await simAwsWithTwoFamilies();
    await simAws
      .ecs()
      .deregisterTaskDefinition(
        new DeregisterTaskDefinitionCommand({ taskDefinition: "billing:1" }),
      );

    // When the families are listed by each status in turn.
    const asked = await simAws
      .ecs()
      .listTaskDefinitionFamilies(
        new ListTaskDefinitionFamiliesCommand({ status: "ACTIVE" }),
      );
    const inactive = await simAws
      .ecs()
      .listTaskDefinitionFamilies(
        new ListTaskDefinitionFamiliesCommand({ status: "INACTIVE" }),
      );
    const all = await simAws
      .ecs()
      .listTaskDefinitionFamilies(
        new ListTaskDefinitionFamiliesCommand({ status: "ALL" }),
      );

    // Then it has moved out of the active listing without being removed.
    assertArrayLength(asked.families, 1);
    assertIdentical(asked.families[0], "checkout");
    assertArrayLength(inactive.families, 1);
    assertIdentical(inactive.families[0], "billing");
    assertArrayLength(all.families, 2);
  });

  it("pages a listing at the size the request asked for", async () => {
    // Given two families.
    const simAws = await simAwsWithTwoFamilies();

    // When they are listed one at a time.
    const first = await simAws
      .ecs()
      .listTaskDefinitionFamilies(
        new ListTaskDefinitionFamiliesCommand({ maxResults: 1 }),
      );
    const second = await simAws.ecs().listTaskDefinitionFamilies(
      new ListTaskDefinitionFamiliesCommand({
        maxResults: 1,
        nextToken: first.nextToken,
      }),
    );

    // Then each page carries one family.
    assertArrayLength(first.families, 1);
    assertIdentical(first.nextToken, "1");
    assertArrayLength(second.families, 1);
    assertUndefined(second.nextToken);
  });

  it("refuses a status this operation does not take", async () => {
    // Given a registered family.
    const simAws = new SimAws();
    await simEcsRegisteredTaskDefinitionFactory.make({}, simAws);

    // When a listing asks for a status ECS has no such value for.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().listTaskDefinitionFamilies({ input: { status: "GONE" } }),
    );

    // Then ECS refuses it.
    assertInstanceOf(error, SimEcsInvalidParameterException);
    assertStringIncludes(error.message, "ACTIVE, INACTIVE and ALL are");
  });
});
