import {
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteRestApiCommand,
  GetResourcesCommand,
  GetRestApiCommand,
  GetRestApisCommand,
  UpdateRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayBadRequest,
  SimApiGatewayNotFound,
} from "../../error/sim-api-gateway.error.js";

describe("Sim API Gateway REST API commands", () => {
  it("creates a REST API with its root resource", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When a REST API is created
    const created = await simAws.apiGateway().createRestApi(
      new CreateRestApiCommand({
        name: "orders",
        description: "The orders API",
      }),
    );

    // Then it reports what API Gateway would have made, including the root
    // resource every REST API is created with
    assertNonNullable(created.id);
    assertIdentical(created.name, "orders");
    assertIdentical(created.description, "The orders API");
    assertNonNullable(created.rootResourceId);
    assertFalse(created.disableExecuteApiEndpoint);
  });

  it("issues an endpoint naming the API id and the region", async () => {
    // Given a REST API in one region
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When the API is asked where one of its stages is served
    const restApi = simAws.apiGateway().findRestApi(created.id);

    // Then the URL names the API, the region and the stage
    assertNonNullable(restApi);
    assertIdentical(
      restApi.invokeUrl("prod"),
      `https://${created.id}.execute-api.${simAws.region().regionName}.amazonaws.com/prod`,
    );
  });

  it("tells two APIs of the same name apart by id", async () => {
    // Given two REST APIs created under one name
    const simAws = new SimAws();
    const first = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));
    const second = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When both are listed
    const listed = await simAws
      .apiGateway()
      .getRestApis(new GetRestApisCommand({}));

    // Then they are two APIs, since a REST API name identifies nothing
    expect(first.id).not.toStrictEqual(second.id);
    expect(listed.items.map((restApi) => restApi.id)).toStrictEqual([
      first.id,
      second.id,
    ]);
  });

  it("reads one API back by id", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When it is read back
    const read = await simAws
      .apiGateway()
      .getRestApi(new GetRestApiCommand({ restApiId: created.id }));

    // Then it is the API that was created
    assertIdentical(read.id, created.id);
    assertIdentical(read.rootResourceId, created.rootResourceId);
  });

  it("refuses to read an API that is not there", async () => {
    // Given a simulated AWS with no APIs
    const simAws = new SimAws();

    // When an unknown id is read
    const read = simAws
      .apiGateway()
      .getRestApi(new GetRestApiCommand({ restApiId: "nosuchapi1" }));

    // Then the request is refused the way API Gateway refuses it
    await expect(read).rejects.toThrow(SimApiGatewayNotFound);
    await expect(read).rejects.toThrow("Invalid REST API identifier specified");
  });

  it("replaces the name and description an update names", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When its name and description are replaced
    const updated = await simAws.apiGateway().updateRestApi(
      new UpdateRestApiCommand({
        restApiId: created.id,
        patchOperations: [
          { op: "replace", path: "/name", value: "orders-v2" },
          { op: "replace", path: "/description", value: "The second one" },
        ],
      }),
    );

    // Then the API carries both, and keeps the id it was created with
    assertIdentical(updated.id, created.id);
    assertIdentical(updated.name, "orders-v2");
    assertIdentical(updated.description, "The second one");
  });

  it("leaves alone what an update does not name", async () => {
    // Given a REST API with a description
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(
        new CreateRestApiCommand({ name: "orders", description: "The first" }),
      );

    // When only the name is replaced
    const updated = await simAws.apiGateway().updateRestApi(
      new UpdateRestApiCommand({
        restApiId: created.id,
        patchOperations: [{ op: "replace", path: "/name", value: "orders-v2" }],
      }),
    );

    // Then the description it was created with stays
    assertIdentical(updated.name, "orders-v2");
    assertIdentical(updated.description, "The first");
  });

  it("refuses an update patching something it does not simulate", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When an update patches a path outside the simulation
    const updated = simAws.apiGateway().updateRestApi(
      new UpdateRestApiCommand({
        restApiId: created.id,
        patchOperations: [
          { op: "replace", path: "/apiKeySource", value: "AUTHORIZER" },
        ],
      }),
    );

    // Then it is refused rather than silently dropped
    await expect(updated).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(updated).rejects.toThrow("'/apiKeySource' is not simulated");
  });

  it("deletes an API and everything under it", async () => {
    // Given a REST API with a resource under its root
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));
    await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId: created.id,
        parentId: created.rootResourceId,
        pathPart: "orders",
      }),
    );

    // When the API is deleted
    await simAws
      .apiGateway()
      .deleteRestApi(new DeleteRestApiCommand({ restApiId: created.id }));

    // Then the API is gone, and so is the tree it owned
    assertUndefined(simAws.apiGateway().findRestApi(created.id));
    await expect(
      simAws
        .apiGateway()
        .getResources(new GetResourcesCommand({ restApiId: created.id })),
    ).rejects.toThrow(SimApiGatewayNotFound);
  });
});
