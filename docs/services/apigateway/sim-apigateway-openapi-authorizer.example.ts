/**
 * Importing a REST API whose method is gated by a security scheme.
 */

import {
  GetAuthorizersCommand,
  GetMethodCommand,
  GetResourcesCommand,
  ImportRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { CreateFunctionCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";
import type { SimRestApiTokenAuthorizerEvent } from "@kensio/yulin/apigateway";
import { makeLambdaZipFileInput } from "@kensio/yulin/lambda";

const simAws = new SimAws();

const { FunctionArn: petsArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "pets",
    Role: "arn:aws:iam::111111111111:role/PetsRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(() => ({
        statusCode: 200,
        body: "pets",
      })),
    },
  }),
);

const { FunctionArn: authorizerArn } = await simAws.lambda().createFunction(
  new CreateFunctionCommand({
    FunctionName: "pet-authorizer",
    Role: "arn:aws:iam::111111111111:role/PetsRole",
    Code: {
      ZipFile: makeLambdaZipFileInput(
        (event: SimRestApiTokenAuthorizerEvent) => ({
          principalId: "pet-owner",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Action: "execute-api:Invoke",
                Effect:
                  event.authorizationToken === "Bearer valid"
                    ? "Allow"
                    : "Deny",
                Resource: event.methodArn,
              },
            ],
          },
        }),
      ),
    },
  }),
);

const openApi = {
  openapi: "3.0.1",
  info: { title: "pets", version: "1.0" },
  paths: {
    "/pets": {
      get: {
        security: [{ "pet-authorizer": [] }],
        "x-amazon-apigateway-integration": {
          type: "aws_proxy",
          httpMethod: "POST",
          uri: petsArn,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      "pet-authorizer": {
        type: "apiKey",
        name: "Authorization",
        in: "header",
        "x-amazon-apigateway-authtype": "custom",
        "x-amazon-apigateway-authorizer": {
          type: "token",
          authorizerUri: authorizerArn,
          authorizerResultTtlInSeconds: 300,
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

const authorizers = await apiGateway.getAuthorizers(
  new GetAuthorizersCommand({ restApiId }),
);

console.log(authorizers.items.map((one) => [one.name, one.type]));
// [ [ "pet-authorizer", "TOKEN" ] ]

const resources = await apiGateway.getResources(
  new GetResourcesCommand({ restApiId }),
);
const pets = resources.items.find((resource) => resource.path === "/pets");

const method = await apiGateway.getMethod(
  new GetMethodCommand({ restApiId, resourceId: pets?.id, httpMethod: "GET" }),
);

console.log(method.authorizationType);
// "CUSTOM"
