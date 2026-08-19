/**
 * Reaching simulated API Gateway through a real APIGatewayClient.
 */

import {
  APIGatewayClient,
  CreateRestApiCommand,
  GetRestApisCommand,
} from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";
import { SimSdk } from "@kensio/yulin/sdk";

const simAws = new SimAws();
using simSdk = new SimSdk({ simAws });

const client = new APIGatewayClient({ region: "eu-west-2" });
simSdk.intercept(client);

await client.send(new CreateRestApiCommand({ name: "orders" }));

const listed = await client.send(new GetRestApisCommand({}));
console.log(listed.items?.map((restApi) => restApi.name));
// [ "orders" ]
