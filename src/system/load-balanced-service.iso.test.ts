import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { UpdateServiceCommand } from "@aws-sdk/client-ecs";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { ordersServiceFactory } from "../../test/orders-service/orders-service.factory.js";
import { ordersServiceNames } from "../../test/orders-service/orders-service-names.js";
import { SimAwsHttp } from "../serve/http/sim-aws-http.js";
import { SimSdk } from "../sdk/index.js";

/**
 * The port the local server would be listening on. Nothing binds it here: the
 * requests go through the in-process HTTP entry point, and the port is part of
 * the Yulin-local host name a client would use against a served simulation.
 */
const localPort = 52_341;

/**
 * The URL a client asks for, which is the Route53 name with the local suffix.
 */
function ordersUrl(path: string): string {
  return `http://${ordersServiceNames.hostname}.sim-aws.localhost:${String(localPort)}${path}`;
}

describe("An orders service behind a load balancer", () => {
  it("takes an order at its own host name and reads it back", async () => {
    // Given the stack deployed, with the application container bound and its
    // AWS SDK clients intercepted, as an application's own would be.
    using simSdk = new SimSdk();

    simSdk.intercept(DynamoDBClient);

    const { simAws } = await ordersServiceFactory.make({}, simSdk.simAws);
    const client = new SimAwsHttp({ simAws });

    // When a client places an order at the name Route53 answers for.
    const placed = await client.fetch(ordersUrl("/orders"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "order-1", item: "one flat white" }),
    });

    // Then the load balancer routed it by host name to the target group, the
    // target group to the service's container, and the container wrote the
    // order to the Table as the task Role.
    assertResponseStatus(placed, 201);
    assertIdentical(placed.headers.get("location"), "/orders/order-1");

    const read = await simAws.dynamoDb().getItem({
      input: {
        TableName: ordersServiceNames.table,
        Key: { orderId: { S: "order-1" } },
      },
    });

    assertIdentical(read.Item?.["item"]?.S, "one flat white");

    // And the same application reads it back on the next request.
    const fetched = await client.fetch(ordersUrl("/orders/order-1"));

    assertResponseStatus(fetched, 200);
    expect(await fetched.json()).toStrictEqual({
      orderId: "order-1",
      item: "one flat white",
    });

    // And an order nobody placed is the application's own answer, rather than
    // anything the load balancer wrote.
    const missing = await client.fetch(ordersUrl("/orders/order-2"));

    assertResponseStatus(missing, 404);
    assertIdentical(await missing.text(), "no such order");
  });

  it("answers 503 when the service is scaled to nothing", async () => {
    // Given the deployed stack, answering requests.
    using simSdk = new SimSdk();

    simSdk.intercept(DynamoDBClient);

    const { simAws } = await ordersServiceFactory.make({}, simSdk.simAws);

    // When the service is scaled in, as it would be to take it out of use.
    await simAws.ecs().updateService(
      new UpdateServiceCommand({
        cluster: ordersServiceNames.cluster,
        service: ordersServiceNames.service,
        desiredCount: 0,
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then its tasks left the target group with it, so the load balancer has
    // nothing to send the request to and answers for itself.
    const response = await new SimAwsHttp({ simAws }).fetch(
      ordersUrl("/orders/order-1"),
    );

    assertResponseStatus(response, 503);
    assertStringIncludes(await response.text(), "503 Service Unavailable");
  });
});
