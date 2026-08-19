import {
  CreateDeploymentCommand,
  CreateRestApiCommand,
  CreateStageCommand,
  DeleteStageCommand,
  GetStageCommand,
  GetStagesCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayConflict,
  SimApiGatewayNotFound,
} from "../../error/sim-api-gateway.error.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";

async function givenRestApi(apiGateway: SimApiGateway): Promise<string> {
  const created = await apiGateway.createRestApi(
    new CreateRestApiCommand({ name: "orders" }),
  );

  return created.id;
}

describe("Sim API Gateway REST API deployment and stage commands", () => {
  it("publishes an API to a stage in one call", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When a deployment names the stage to publish it to
    const deployment = await simAws.apiGateway().createDeployment(
      new CreateDeploymentCommand({
        restApiId,
        stageName: "prod",
        description: "The first one",
        variables: { catalogue: "v2" },
      }),
    );

    // Then the stage is there, pointing at that deployment
    assertNonNullable(deployment.id);
    assertIdentical(deployment.description, "The first one");
    const stage = await simAws
      .apiGateway()
      .getStage(new GetStageCommand({ restApiId, stageName: "prod" }));
    assertIdentical(stage.stageName, "prod");
    assertIdentical(stage.deploymentId, deployment.id);
    expect(stage.variables).toStrictEqual({ catalogue: "v2" });
  });

  it("creates a deployment nothing serves until a stage points at it", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When a deployment is created without a stage name
    const deployment = await simAws
      .apiGateway()
      .createDeployment(new CreateDeploymentCommand({ restApiId }));

    // Then the API has no stage yet, so nothing reaches it
    const stages = await simAws
      .apiGateway()
      .getStages(new GetStagesCommand({ restApiId }));
    expect(stages.item).toStrictEqual([]);

    // And a stage created against it publishes the API
    const stage = await simAws.apiGateway().createStage(
      new CreateStageCommand({
        restApiId,
        stageName: "prod",
        deploymentId: deployment.id,
        description: "The live stage",
      }),
    );
    assertIdentical(stage.deploymentId, deployment.id);
    assertIdentical(stage.description, "The live stage");
  });

  it("refuses a stage against a deployment that is not there", async () => {
    // Given a REST API with no deployments
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When a stage names one
    const stage = simAws.apiGateway().createStage(
      new CreateStageCommand({
        restApiId,
        stageName: "prod",
        deploymentId: "nosuch",
      }),
    );

    // Then it is refused
    await expect(stage).rejects.toThrow(SimApiGatewayNotFound);
    await expect(stage).rejects.toThrow("Invalid deployment identifier");
  });

  it("refuses a second stage of the same name", async () => {
    // Given an API published to a stage
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());
    const deployment = await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
      );

    // When a second stage claims the same name
    const stage = simAws.apiGateway().createStage(
      new CreateStageCommand({
        restApiId,
        stageName: "prod",
        deploymentId: deployment.id,
      }),
    );

    // Then it is refused, since a stage name is the first path segment the
    // stage serves on
    await expect(stage).rejects.toThrow(SimApiGatewayConflict);
  });

  it("serves several stages of one API side by side", async () => {
    // Given an API deployed twice
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());
    await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
      );
    await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "dev" }),
      );

    // When its stages are listed
    const stages = await simAws
      .apiGateway()
      .getStages(new GetStagesCommand({ restApiId }));

    // Then both are there, each on its own path segment
    expect(stages.item.map((stage) => stage.stageName)).toStrictEqual([
      "prod",
      "dev",
    ]);
    const restApi = simAws.apiGateway().findRestApi(restApiId);
    assertNonNullable(restApi);
    expect(restApi.invokeUrl("dev")).toMatch(/\/dev$/);
  });

  it("lists the stages of one deployment", async () => {
    // Given two deployments, each with a stage
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());
    const first = await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
      );
    await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "dev" }),
      );

    // When the stages of one deployment are listed
    const stages = await simAws
      .apiGateway()
      .getStages(new GetStagesCommand({ restApiId, deploymentId: first.id }));

    // Then only its own stage is reported
    expect(stages.item.map((stage) => stage.stageName)).toStrictEqual(["prod"]);
  });

  it("leaves the API standing when a stage is deleted", async () => {
    // Given an API published to two stages
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());
    await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
      );
    await simAws
      .apiGateway()
      .createDeployment(
        new CreateDeploymentCommand({ restApiId, stageName: "dev" }),
      );

    // When one stage is deleted
    await simAws
      .apiGateway()
      .deleteStage(new DeleteStageCommand({ restApiId, stageName: "dev" }));

    // Then the other still serves the same API
    const stages = await simAws
      .apiGateway()
      .getStages(new GetStagesCommand({ restApiId }));
    expect(stages.item.map((stage) => stage.stageName)).toStrictEqual(["prod"]);
    assertUndefined(
      simAws.apiGateway().findRestApi(restApiId)?.stages.find("dev"),
    );
  });

  it("refuses to delete a stage that is not there", async () => {
    // Given an API with no stages
    const simAws = new SimAws();
    const restApiId = await givenRestApi(simAws.apiGateway());

    // When one is deleted
    const deleted = simAws
      .apiGateway()
      .deleteStage(new DeleteStageCommand({ restApiId, stageName: "prod" }));

    // Then it is refused
    await expect(deleted).rejects.toThrow(SimApiGatewayNotFound);
    await expect(deleted).rejects.toThrow("Invalid stage identifier");
  });
});
