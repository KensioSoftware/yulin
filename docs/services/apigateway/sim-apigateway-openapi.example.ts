/**
 * Creating a simulated REST API from an OpenAPI 3 definition.
 */

import {
  CreateDeploymentCommand,
  GetResourcesCommand,
  ImportRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  AddPermissionCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";
import { serveSimAws, type SimPayload1Event } from "@kensio/yulin/serve";

const simAws = new SimAws();

const { FunctionArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "pets",
    Role: "arn:aws:iam::111111111111:role/PetsRole",
    Code: {
      ZipFile: makeLambdaZipFileInput((event: SimPayload1Event) => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `pet ${event.pathParameters?.["petId"] ?? "none"}`,
      })),
    },
  }),
);

const openApi = {
  openapi: "3.0.1",
  info: { title: "pets", version: "1.0" },
  paths: {
    "/pets/{petId}": {
      get: {
        // Ignored, as on AWS, since no request validator names this schema.
        responses: { "200": { description: "200 response" } },
        "x-amazon-apigateway-integration": {
          type: "aws_proxy",
          httpMethod: "POST",
          uri:
            `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/` +
            `${FunctionArn}/invocations`,
        },
      },
    },
  },
};

const apiGateway = simAws.apiGateway();
const definition = new TextEncoder().encode(JSON.stringify(openApi));

const { id: restApiId } = await apiGateway.importRestApi(
  new ImportRestApiCommand({ body: definition }),
);

const resources = await apiGateway.getResources(
  new GetResourcesCommand({ restApiId }),
);

console.log(resources.items.map((resource) => resource.path));
// [ "/", "/pets", "/pets/{petId}" ]

// An import creates no stage. The API answers 403 until one is deployed.
await apiGateway.createDeployment(
  new CreateDeploymentCommand({ restApiId, stageName: "prod" }),
);

await simAws.lambda().addPermission(
  new AddPermissionCommand({
    FunctionName: "pets",
    StatementId: "api-gateway-invoke",
    Action: "lambda:InvokeFunction",
    Principal: "apigateway.amazonaws.com",
    SourceArn: `arn:aws:execute-api:us-east-1:888888888888:${restApiId}/*/*/*`,
  }),
);

const srv = await serveSimAws({ simAws });

const response = await fetch(
  srv.localUrl(
    `https://${restApiId}.execute-api.us-east-1.amazonaws.com/prod/pets/42`,
  ),
);

console.log(await response.text());
// "pet 42"

await srv.close();
