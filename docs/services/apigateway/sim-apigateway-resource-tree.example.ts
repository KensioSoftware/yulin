/**
 * Building /orders/{orderId} out of two resources.
 *
 * Each resource holds one segment and names its parent, and API Gateway
 * computes the full path from where the resource sits.
 */

import {
  CreateResourceCommand,
  CreateRestApiCommand,
  GetResourcesCommand,
} from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const apiGateway = simAws.apiGateway();

const api = await apiGateway.createRestApi(
  new CreateRestApiCommand({ name: "orders" }),
);

const orders = await apiGateway.createResource(
  new CreateResourceCommand({
    restApiId: api.id,
    parentId: api.rootResourceId,
    pathPart: "orders",
  }),
);

await apiGateway.createResource(
  new CreateResourceCommand({
    restApiId: api.id,
    parentId: orders.id,
    pathPart: "{orderId}",
  }),
);

const listed = await apiGateway.getResources(
  new GetResourcesCommand({ restApiId: api.id }),
);

console.log(listed.items.map((resource) => resource.path));
// [ "/", "/orders", "/orders/{orderId}" ]
