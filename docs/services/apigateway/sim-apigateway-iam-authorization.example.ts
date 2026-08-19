/**
 * Protecting a simulated REST API method with IAM.
 *
 * The caller the request was attributed to has to be allowed
 * execute-api:Invoke on the method it is calling.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";

import { SimAws } from "@kensio/yulin";
import { simRestApiLambdaProxyFactory } from "@kensio/yulin/apigateway";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const restApi = await simRestApiLambdaProxyFactory.make(
  {
    iamAuthorization: true,
    resourcePaths: ["/orders/{orderId}"],
    handler: (event) => ({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: `orders for ${event.requestContext.identity.userArn ?? "nobody"}`,
    }),
  },
  simAws,
);

// A Role of the API's own Account, allowed to call the orders methods of this
// API on the stage it is deployed to.
await simAws.iam().createRole(
  new CreateRoleCommand({
    RoleName: "Reporter",
    AssumeRolePolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: "arn:aws:iam::888888888888:root" },
          Action: "sts:AssumeRole",
        },
      ],
    }),
  }),
);

await simAws.iam().putRolePolicy(
  new PutRolePolicyCommand({
    RoleName: "Reporter",
    PolicyName: "InvokeOrders",
    PolicyDocument: JSON.stringify({
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "execute-api:Invoke",
          Resource: `arn:aws:execute-api:us-east-1:888888888888:${restApi.apiId}/prod/GET/orders/*`,
        },
      ],
    }),
  }),
);

const srv = await serveSimAws({ simAws });
const url = srv.localUrl(`${restApi.invokeUrl("prod")}/orders/42`);

const anonymous = await fetch(url);

console.log(anonymous.status);
// 403

const reporter = await fetch(url, {
  headers: { "x-sim-aws-caller": "arn:aws:iam::888888888888:role/Reporter" },
});

console.log(await reporter.text());
// "orders for arn:aws:iam::888888888888:role/Reporter"

await srv.close();
