import {
  CreateResourceCommand,
  CreateRestApiCommand,
  DeleteResourceCommand,
  GetResourceCommand,
  GetResourcesCommand,
  PutMethodCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayBadRequest,
  SimApiGatewayConflict,
  SimApiGatewayNotFound,
} from "../../error/sim-api-gateway.error.js";
import type { SimApiGateway } from "../../sim-api-gateway.js";

/**
 * A REST API with its root resource id, which is where every path starts.
 */
async function givenRestApi(
  apiGateway: SimApiGateway,
): Promise<{ readonly restApiId: string; readonly rootResourceId: string }> {
  const created = await apiGateway.createRestApi(
    new CreateRestApiCommand({ name: "orders" }),
  );

  return { restApiId: created.id, rootResourceId: created.rootResourceId };
}

describe("Sim API Gateway REST API resource commands", () => {
  it("builds a path out of resources under the root", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );

    // When two path parts are added, one under the other
    const orders = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders",
      }),
    );
    const one = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: orders.id,
        pathPart: "{orderId}",
      }),
    );

    // Then each carries the full path its place in the tree gives it
    assertIdentical(orders.path, "/orders");
    assertIdentical(orders.pathPart, "orders");
    assertIdentical(one.path, "/orders/{orderId}");
    assertIdentical(one.parentId, orders.id);
  });

  it("refuses a second resource with the same part under one parent", async () => {
    // Given a path part already added under the root
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );
    await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders",
      }),
    );

    // When the same part is added under the same parent again
    const again = simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders",
      }),
    );

    // Then it is refused, since two resources cannot share one path
    await expect(again).rejects.toThrow(SimApiGatewayConflict);
  });

  it("refuses a resource under a greedy path part", async () => {
    // Given a greedy path part, which matches the rest of the request path
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );
    const proxy = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "{proxy+}",
      }),
    );

    // When something is added under it
    const under = simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: proxy.id,
        pathPart: "orders",
      }),
    );

    // Then it is refused, because nothing can follow a part that has already
    // matched everything left of the path
    await expect(under).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(under).rejects.toThrow(
      "captures the rest of the request path",
    );
  });

  it("refuses a path part that is not one segment", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );

    // When a part carrying its own separator is added
    const created = simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders/{orderId}",
      }),
    );

    // Then it is refused, since a resource holds one segment
    await expect(created).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(created).rejects.toThrow("is invalid");
  });

  it("leaves the methods out of a response that did not ask for them", async () => {
    // Given a resource with a method declared on it
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );
    const orders = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders",
      }),
    );
    await simAws.apiGateway().putMethod(
      new PutMethodCommand({
        restApiId,
        resourceId: orders.id,
        httpMethod: "GET",
        authorizationType: "NONE",
      }),
    );

    // When the resource is read with and without the methods embedded
    const plain = await simAws
      .apiGateway()
      .getResource(
        new GetResourceCommand({ restApiId, resourceId: orders.id }),
      );
    const embedded = await simAws.apiGateway().getResource(
      new GetResourceCommand({
        restApiId,
        resourceId: orders.id,
        embed: ["methods"],
      }),
    );

    // Then only the embedded response carries them, as on real AWS
    assertUndefined(plain.resourceMethods);
    assertNonNullable(embedded.resourceMethods);
    expect(Object.keys(embedded.resourceMethods)).toStrictEqual(["GET"]);
  });

  it("lists the whole tree, the root included", async () => {
    // Given a two-deep path
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );
    const orders = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders",
      }),
    );
    await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: orders.id,
        pathPart: "{orderId}",
      }),
    );

    // When the resources are listed
    const listed = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId }));

    // Then every node of the tree is there
    expect(listed.items.map((resource) => resource.path)).toStrictEqual([
      "/",
      "/orders",
      "/orders/{orderId}",
    ]);
  });

  it("deletes a resource and everything under it", async () => {
    // Given a two-deep path
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );
    const orders = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: rootResourceId,
        pathPart: "orders",
      }),
    );
    const one = await simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId,
        parentId: orders.id,
        pathPart: "{orderId}",
      }),
    );

    // When the top of it is deleted
    await simAws
      .apiGateway()
      .deleteResource(
        new DeleteResourceCommand({ restApiId, resourceId: orders.id }),
      );

    // Then the subtree goes with it, and the root stays
    const listed = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId }));
    expect(listed.items.map((resource) => resource.path)).toStrictEqual(["/"]);
    await expect(
      simAws
        .apiGateway()
        .getResource(new GetResourceCommand({ restApiId, resourceId: one.id })),
    ).rejects.toThrow(SimApiGatewayNotFound);
  });

  it("refuses to delete the root resource", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const { restApiId, rootResourceId } = await givenRestApi(
      simAws.apiGateway(),
    );

    // When its root resource is deleted
    const deleted = simAws
      .apiGateway()
      .deleteResource(
        new DeleteResourceCommand({ restApiId, resourceId: rootResourceId }),
      );

    // Then it is refused, since every REST API has one
    await expect(deleted).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(deleted).rejects.toThrow("root resource cannot be deleted");
  });
});
