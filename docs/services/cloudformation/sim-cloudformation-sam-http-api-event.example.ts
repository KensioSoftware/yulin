/**
 * A SAM function reached through the HTTP API its HttpApi event made.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "rates-api-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Resources: {
      Rates: {
        Type: "AWS::Serverless::Function",
        Properties: {
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Events: {
            Get: {
              Type: "HttpApi",
              Properties: { Path: "/rates/{currency}", Method: "GET" },
            },
          },
        },
      },
    },
    Outputs: {
      ApiEndpoint: {
        Value: { "Fn::GetAtt": ["ServerlessHttpApi", "ApiEndpoint"] },
      },
    },
  },
  bindings: [
    {
      logicalId: "Rates",
      handler: (request: {
        pathParameters?: Record<string, string>;
      }): { statusCode: number; body: string } => ({
        statusCode: 200,
        body: `rate for ${request.pathParameters?.["currency"]}`,
      }),
    },
  ],
});

await stack.waitForDeployComplete();

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(`${stack.output("ApiEndpoint")}/rates/GBP`),
);

console.log(await response.text());

await srv.close();
