import {
  CreateRouteCommand,
  DeleteRouteCommand,
  GetRoutesCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simHttpApiLambdaProxyFactory } from "../../api/sim-http-api-lambda-proxy.factory.js";
import { SimApiGatewayV2NotFound } from "../../error/sim-api-gateway-v2.error.js";

function localUrl(apiEndpoint: string, path: string): string {
  return new SimAwsLocalUrl({ input: `${apiEndpoint}${path}` }).toString();
}

/** A handler echoing its invocation event back, so a test can assert on it. */
const echoEvent = (event: SimPayload2Event): SimPayload2Event => event;

/**
 * The id of the route holding one route key, which is how a route is addressed
 * once it exists.
 */
async function routeId(
  simAws: SimAws,
  apiId: string,
  routeKey: string,
): Promise<string> {
  const { Items: routes } = await simAws
    .apiGatewayV2()
    .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
  const route = routes.find((one) => one.RouteKey === routeKey);
  assertDefined(route, `The API has no route for ${routeKey}`);

  return route.RouteId;
}

describe("Sim API Gateway v2 DeleteRoute", () => {
  it("stops the deleted route matching and leaves the others", async () => {
    // Given an API serving two routes
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets", "GET /orders"] },
      simAws,
    );

    // When one of them is deleted
    await simAws.apiGatewayV2().deleteRoute(
      new DeleteRouteCommand({
        ApiId: api.apiId,
        RouteId: await routeId(simAws, api.apiId, "GET /pets"),
      }),
    );

    // Then a request that used to reach it gets what an unmatched request
    // gets, and the other route still serves
    const http = new SimAwsHttp({ simAws });
    const deleted = await http.fetch(localUrl(api.apiEndpoint, "/pets"));
    assertIdentical(deleted.status, 404);
    expect(await deleted.json()).toStrictEqual({ message: "Not Found" });

    const kept = await http.fetch(localUrl(api.apiEndpoint, "/orders"));
    assertIdentical(kept.status, 200);
    const event = (await kept.json()) as SimPayload2Event;
    assertIdentical(event.routeKey, "GET /orders");

    // And the API reports only the route it still has
    const { Items: routes } = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: api.apiId }));
    expect(routes.map((route) => route.RouteKey)).toStrictEqual([
      "GET /orders",
    ]);
  });

  it("frees the route key the deleted route held", async () => {
    // Given an API whose one route is deleted
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent, routeKeys: ["GET /pets"] },
      simAws,
    );
    const { Items: created } = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: api.apiId }));
    await simAws.apiGatewayV2().deleteRoute(
      new DeleteRouteCommand({
        ApiId: api.apiId,
        RouteId: created[0]?.RouteId,
      }),
    );

    // When the same route key is created again
    const recreated = await simAws.apiGatewayV2().createRoute(
      new CreateRouteCommand({
        ApiId: api.apiId,
        RouteKey: "GET /pets",
        Target: created[0]?.Target,
      }),
    );

    // Then nothing conflicts with it, since the deleted route no longer holds
    // the key, and the new route is a route of its own
    assertIdentical(recreated.RouteKey, "GET /pets");
    expect(recreated.RouteId).not.toBe(created[0]?.RouteId);
  });

  it("refuses a route id the API does not have", async () => {
    // Given an API with a route
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When some other route id is deleted
    // Then it is reported as not found
    await expect(
      simAws
        .apiGatewayV2()
        .deleteRoute(
          new DeleteRouteCommand({ ApiId: api.apiId, RouteId: "abcdefgh" }),
        ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("requires the route to delete", async () => {
    // Given an API
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { handler: echoEvent },
      simAws,
    );

    // When no route id is given, which the SDK command type does not allow but
    // a hand-built request can carry
    // Then the command is refused rather than deleting anything
    await expect(
      simAws.apiGatewayV2().deleteRoute({ input: { ApiId: api.apiId } }),
    ).rejects.toThrow(/DeleteRoute requires RouteId/);
  });
});
