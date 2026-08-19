import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { serveSimAws } from "../../../serve/index.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";

/**
 * Slower local integration test. Serves the simulation over real localhost
 * HTTP and drives it with the platform fetch, rather than in process.
 */
describe("Serving a sim REST API on localhost", () => {
  it("proxies a real localhost request to the integrated function", async () => {
    // Given a REST API proxying every request to a simulated Lambda function
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders/{orderId}"],
        handler: (event) => ({
          statusCode: 200,
          headers: { "content-type": "text/plain" },
          body: `order ${event.pathParameters?.["orderId"] ?? "none"} limit ${
            event.queryStringParameters?.["limit"] ?? "none"
          }`,
        }),
      },
      simAws,
    );

    // And the simulation served on localhost
    const srv = await serveSimAws({ simAws });

    try {
      // When the stage's invoke URL is fetched over real localhost HTTP
      const response = await fetch(
        srv.localUrl(`${restApi.invokeUrl("prod")}/orders/6?limit=10`),
      );

      // Then the function handled the real HTTP request
      assertIdentical(response.status, 200);
      assertIdentical(response.headers.get("content-type"), "text/plain");
      assertIdentical(await response.text(), "order 6 limit 10");
    } finally {
      await srv.close();
    }
  });
});
