/**
 * Gating a REST API method with a TOKEN Lambda authorizer.
 *
 * The authorizer reads the Authorization header, and the policy it answers is
 * evaluated against the ARN of the request being made.
 */

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    resourcePaths: ["/orders"],
    authorizerHandler: (event) => ({
      principalId: "user-6",
      context: { tenantId: "acme" },
      policyDocument: {
        Version: "2012-10-17",
        Statement: [
          {
            Action: "execute-api:Invoke",
            Effect:
              event.authorizationToken === "Bearer valid" ? "Allow" : "Deny",
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
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders`);

const admitted = await fetch(url, {
  headers: { authorization: "Bearer valid" },
});

console.log(admitted.status);
// 200

console.log(await admitted.text());
// '{"tenantId":"acme","principalId":"user-6"}'

const refused = await fetch(url, {
  headers: { authorization: "Bearer stale" },
});

console.log(refused.status);
// 403

const anonymous = await fetch(url);

console.log(anonymous.status);
// 401

await srv.close();
