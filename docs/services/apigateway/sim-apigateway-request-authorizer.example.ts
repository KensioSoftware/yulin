/**
 * Gating a REST API method with a REQUEST Lambda authorizer.
 *
 * The authorizer reads a header and a query string parameter together, which
 * is what a TOKEN authorizer cannot do.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    httpMethod: "GET",
    authorizerIdentitySource:
      "method.request.header.X-Tenant,method.request.querystring.plan",
    requestAuthorizerHandler: (event) => ({
      principalId: event.headers["x-tenant"],
      context: { plan: event.queryStringParameters["plan"] },
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect:
              event.queryStringParameters["plan"] === "gold" ? "Allow" : "Deny",
            Resource: event.methodArn,
          },
        ],
      },
    }),
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(event.requestContext.authorizer),
    }),
  },
  simAws,
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`).href;
const headers = { "x-tenant": "acme" };

const admitted = await fetch(`${url}?plan=gold`, { headers });

console.log(admitted.status);
// 200

console.log(await admitted.text());
// '{"plan":"gold","principalId":"acme"}'

const refused = await fetch(`${url}?plan=free`, { headers });

console.log(refused.status);
// 403

const anonymous = await fetch(`${url}?plan=gold`);

console.log(anonymous.status);
// 401

await srv.close();
