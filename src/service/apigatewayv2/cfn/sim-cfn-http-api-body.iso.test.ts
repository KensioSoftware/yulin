import { GetApiCommand, GetRoutesCommand } from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertTypeString } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployHttpApi,
  deployHttpApiFailure,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigatewayv2/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCfnImportedHttpApiIntegration,
  simCfnImportedHttpApiTemplateFactory,
} from "./sim-cfn-imported-http-api-template.factory.js";
import { simCfnHttpApiTemplateFactory } from "./sim-cfn-http-api-template.factory.js";

/**
 * A handler reporting which route served the request.
 */
const routeReportingHandler = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.routeKey + " " + JSON.stringify(event.pathParameters ?? {}),
});
`;

const ordersPaths = {
  "/orders/{orderId}": {
    get: {
      "x-amazon-apigateway-integration": simCfnImportedHttpApiIntegration,
    },
  },
};

describe("Deploying a sim HTTP API from an AWS::ApiGatewayV2::Api Body", () => {
  it("serves the routes the document declares, with no Name or ProtocolType", async () => {
    // Given a template whose Api carries only a Body
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        handlerSource: routeReportingHandler,
        paths: ordersPaths,
      }),
    );

    // When the deployed endpoint is requested
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${apiEndpoint}/orders/YL-1` }).toString(),
    );

    // Then the route the document declared served it, and the document's title
    // named the API
    assertIdentical(response.status, 200);
    assertIdentical(
      await response.text(),
      'GET /orders/{orderId} {"orderId":"YL-1"}',
    );
    const apiId = apiEndpoint.split(".", 1)[0]?.replace("https://", "");
    const api = await simAws
      .apiGatewayV2()
      .getApi(new GetApiCommand({ ApiId: apiId }));
    assertIdentical(api.Name, "orders");
  });

  it("deploys the same document with ProtocolType HTTP and a Name", async () => {
    // Given the same template naming the API and its protocol, both of which
    // AWS documents as optional alongside a Body
    const simAws = simAwsInEuWest2();
    const stack = await deployHttpApi(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        apiProperties: { Name: "orders-api", ProtocolType: "HTTP" },
      }),
    );

    // When the deployed API is read back
    const apiEndpoint = stack.outputs.get("ApiEndpoint")?.value;
    assertTypeString(apiEndpoint);
    const apiId = apiEndpoint.split(".", 1)[0]?.replace("https://", "");
    const api = await simAws
      .apiGatewayV2()
      .getApi(new GetApiCommand({ ApiId: apiId }));

    // Then Name named it, rather than the document's title, and the routes are
    // still the document's
    assertIdentical(api.Name, "orders-api");
    const routes = await simAws
      .apiGatewayV2()
      .getRoutes(new GetRoutesCommand({ ApiId: apiId }));
    expect(routes.Items.map((route) => route.RouteKey)).toStrictEqual([
      "GET /orders/{orderId}",
    ]);
  });

  it("refuses a WebSocket protocol type alongside a Body", async () => {
    // Given a template importing a document into a WebSocket API
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        apiProperties: { ProtocolType: "WEBSOCKET" },
      }),
    );

    // Then the stack fails, since an OpenAPI document declares an HTTP API
    expect(error.message).toContain(
      "property ProtocolType cannot be deployed: an OpenAPI document " +
        "declares an HTTP API",
    );
  });

  it("creates an imported API without a property it would drop", async () => {
    // Given a template describing the API it imports
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        apiProperties: { Description: "Order intake" },
      }),
    );

    // Then the API is created from the document without the description, since
    // ImportApi does not take it and nothing here updates an API afterwards
    const [reason] = ignoredReasons(stack);
    expect(reason).toContain(
      "property Description is not applied: ImportApi does not take it",
    );
  });

  it("creates an Api that imports nothing without its FailOnWarnings", async () => {
    // Given a Resource-declared API asking what to do with import warnings
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: { FailOnWarnings: true },
      }),
    );

    // Then the API is created and the property is recorded, since there is no
    // document for it to be about and real CloudFormation accepts this too
    const [reason] = ignoredReasons(stack);
    expect(reason).toContain(
      "property FailOnWarnings is not applied: it says what to do with " +
        "the warnings an OpenAPI import finds",
    );
  });

  it("refuses the lenient FailOnWarnings on an imported Api", async () => {
    // Given a template asking for warnings not to fail the import
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        apiProperties: { FailOnWarnings: false },
      }),
    );

    // Then ImportApi refuses it, with the reason it refuses it
    expect(error.message).toContain(
      "ImportApi FailOnWarnings false is not simulated",
    );
  });

  it("refuses a Body that is not an object", async () => {
    // Given a template carrying the document as a serialised string, which is
    // how ImportApi takes it and not how CloudFormation carries it
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        apiProperties: { Body: "{}" },
      }),
    );

    // Then the stack fails, naming the shape the property has to be
    expect(error.message).toContain("Body must be an inline OpenAPI document");
  });

  it("creates an API without a BodyS3Location, which is still not read", async () => {
    // Given a template keeping its document in a bucket
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const stack = await deployHttpApi(
      simAws,
      simCfnHttpApiTemplateFactory.make({
        apiProperties: {
          BodyS3Location: { Bucket: "templates", Key: "orders.json" },
        },
      }),
    );

    // Then the API is created with no routes at all, since reading a document
    // out of a bucket adds a fetch path and nothing about OpenAPI
    const [reason] = ignoredReasons(stack);
    expect(reason).toContain(
      "AWS::ApiGatewayV2::Api property BodyS3Location is not simulated",
    );
  });

  it("refuses a Route Resource on an API a document declared", async () => {
    // Given a template declaring the API as a document and adding a route to
    // it as a Resource as well
    const simAws = simAwsInEuWest2();

    // When it is deployed
    const error = await deployHttpApiFailure(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        resources: {
          ExtraRoute: {
            Type: "AWS::ApiGatewayV2::Route",
            Properties: {
              ApiId: { Ref: "Api" },
              RouteKey: "GET /invoices",
              Target: "integrations/whatever",
            },
          },
        },
      }),
    );

    // Then the stack fails naming both Resources, rather than deploying a
    // template that was written two ways at once
    expect(error.message).toContain("AWS::ApiGatewayV2::Route ExtraRoute");
    expect(error.message).toContain(
      "is declared as an OpenAPI document by Api",
    );
  });

  it("refuses an Integration or Authorizer Resource on an imported API too", async () => {
    // Given templates adding each to an API a document declared
    const simAws = simAwsInEuWest2();
    const resources = {
      ExtraIntegration: {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
          ApiId: { Ref: "Api" },
          IntegrationType: "AWS_PROXY",
          IntegrationUri: { "Fn::GetAtt": ["Handler", "Arn"] },
          PayloadFormatVersion: "2.0",
        },
      },
    };

    // When the integration one is deployed
    const integrationError = await deployHttpApiFailure(
      simAws,
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        resources,
      }),
    );

    // And the authorizer one
    const authorizerError = await deployHttpApiFailure(
      simAwsInEuWest2(),
      simCfnImportedHttpApiTemplateFactory.make({
        paths: ordersPaths,
        resources: {
          ExtraAuthorizer: {
            Type: "AWS::ApiGatewayV2::Authorizer",
            Properties: {
              ApiId: { Ref: "Api" },
              Name: "pool",
              AuthorizerType: "JWT",
              IdentitySource: ["$request.header.Authorization"],
              JwtConfiguration: {
                Issuer: "https://example.com",
                Audience: ["orders"],
              },
            },
          },
        },
      }),
    );

    // Then both fail the stack, naming the Resource and the import
    expect(integrationError.message).toContain(
      "AWS::ApiGatewayV2::Integration ExtraIntegration",
    );
    expect(authorizerError.message).toContain(
      "AWS::ApiGatewayV2::Authorizer ExtraAuthorizer",
    );
  });
});
