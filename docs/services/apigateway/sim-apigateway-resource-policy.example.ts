/**
 * Limiting a simulated REST API to one address range with a resource policy.
 */

import { UpdateRestApiCommand } from "@aws-sdk/client-api-gateway";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    handler: () => ({ statusCode: 200, body: "orders" }),
  },
  simAws,
);

await simAws.apiGateway().updateRestApi(
  new UpdateRestApiCommand({
    restApiId: restApi.apiId,
    patchOperations: [
      {
        op: "replace",
        path: "/policy",
        value: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: "*",
              Action: "execute-api:Invoke",
              Resource: "execute-api:/*",
              Condition: { IpAddress: { "aws:SourceIp": "192.0.2.0/24" } },
            },
          ],
        }),
      },
    ],
  }),
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);

const office = await fetch(url, {
  headers: { "x-sim-aws-source-ip": "192.0.2.10" },
});

console.log(office.status);
// 200

const elsewhere = await fetch(url);

console.log(elsewhere.status);
// 403

await srv.close();
