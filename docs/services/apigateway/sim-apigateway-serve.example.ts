/**
 * Serving a request through a REST API to its Lambda proxy integration.
 *
 * The handler reads the payload format 1.0 event a REST API sends, which is
 * the older of the two formats and the only one a REST API uses.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders/{orderId}"],
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: `order ${event.pathParameters?.["orderId"] ?? "none"}`,
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(`${restApi.invokeUrl("prod")}/orders/6`),
);

console.log(response.status);
// 200

console.log(await response.text());
// "order 6"

await srv.close();
