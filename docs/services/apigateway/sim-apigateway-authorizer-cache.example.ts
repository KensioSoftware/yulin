/**
 * Caching a simulated REST API Lambda authorizer's decision.
 *
 * The authorizer counts its own invocations and reports the count in its
 * context, so the handler shows which decision served each request.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const counter = { invocations: 0 };

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    authorizerResultTtlSeconds: 300,
    authorizerHandler: (event) => {
      counter.invocations += 1;

      return {
        principalId: "user-6",
        context: { ...counter },
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Action: "execute-api:Invoke",
              Effect: "Allow",
              Resource: event.methodArn,
            },
          ],
        },
      };
    },
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.requestContext.authorizer),
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);
const call = async (): Promise<unknown> => {
  const response = await fetch(url, {
    headers: { authorization: "Bearer session-6" },
  });

  return await response.json();
};

console.log(await call());
// { invocations: 1, principalId: 'user-6' }

console.log(await call());
// { invocations: 1, principalId: 'user-6' }, held rather than asked again

await simAws.clock().advanceBy({ minutes: 6 });

console.log(await call());
// { invocations: 2, principalId: 'user-6' }

await srv.close();
