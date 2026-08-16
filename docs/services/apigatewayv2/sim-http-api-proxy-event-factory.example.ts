/**
 * Making an HTTP API invocation event to call an integration handler with.
 */

import { VariantFactory } from "@kensio/part-factory";

import {
  httpApiProxyEventFactory,
  type SimPayload2Event,
} from "@kensio/yulin/apigatewayv2";

function ordersHandler(event: SimPayload2Event): string {
  return `${event.requestContext.http.method} ${event.pathParameters?.["orderId"] ?? "all"}`;
}

// A request naming only its route: the method and path come from the route key.
const listing = httpApiProxyEventFactory.make({ routeKey: "GET /orders" });

// GET all
console.log(ordersHandler(listing));

// A request to a parameterised route says the concrete path and what the route
// captured from it.
const orderRequestFactory = new VariantFactory(httpApiProxyEventFactory, {
  routeKey: "GET /orders/{orderId}",
});

const order = orderRequestFactory.make({
  rawPath: "/orders/YL-1",
  pathParameters: { orderId: "YL-1" },
});

// GET YL-1
console.log(ordersHandler(order));
