import {
  GetAuthorizersCommand,
  GetMethodCommand,
  GetResourcesCommand,
  GetRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertTypeString,
  describeResponse,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import {
  deployRestApi,
  deployRestApiFailure,
  ignoredReasons,
  simAwsInEuWest2,
} from "../../../../test/apigateway/cfn-deploy.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import {
  simCfnImportedRestApiIntegration,
  simCfnImportedRestApiTemplateFactory,
} from "./sim-cfn-imported-rest-api-template.factory.js";

/**
 * A handler reporting which resource template served the request.
 */
const resourceReportingHandler = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: event.resource + " " + JSON.stringify(event.pathParameters ?? {}),
});
`;

/**
 * A Swagger 2.0 definition, which is the specification this reads nothing
 * from.
 */
const swaggerDefinition = {
  swagger: "2.0",
  info: { title: "pets", version: "1.0" },
  paths: {},
};

const petPaths = {
  "/pets/{petId}": {
    get: {
      "x-amazon-apigateway-integration": simCfnImportedRestApiIntegration,
    },
  },
};

/**
 * The API id the deployed stack's URL names.
 */
function apiIdOf(apiUrl: string): string {
  return apiUrl.replace("https://", "").split(".", 1)[0] ?? "";
}

describe("Deploying a sim REST API from an AWS::ApiGateway::RestApi Body", () => {
  it("serves the methods the document declares, with no Name", async () => {
    // Given a template whose RestApi carries only a Body
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        handlerSource: resourceReportingHandler,
        paths: petPaths,
      }),
    );

    // When the deployed endpoint is requested
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const response = await new SimAwsHttp({ simAws }).fetch(
      new SimAwsLocalUrl({ input: `${apiUrl}/pets/YL-1` }).toString(),
    );

    // Then the method the document declared served it, and the document's
    // title named the API
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), '/pets/{petId} {"petId":"YL-1"}');
    const restApi = await simAws
      .apiGateway()
      .getRestApi(new GetRestApiCommand({ restApiId: apiIdOf(apiUrl) }));
    assertIdentical(restApi.name, "pets");
  });

  it("takes the Name property as the imported API's name", async () => {
    // Given the same template naming the API, which AWS documents as optional
    // alongside a Body
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        paths: petPaths,
        apiProperties: { Name: "pets-api" },
      }),
    );

    // Then the property named the API rather than the document's own title,
    // and the path tree is still the document's
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const restApiId = apiIdOf(apiUrl);
    const restApi = await simAws
      .apiGateway()
      .getRestApi(new GetRestApiCommand({ restApiId }));
    assertIdentical(restApi.name, "pets-api");
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId }));
    expect(resources.items.map((resource) => resource.path)).toStrictEqual([
      "/",
      "/pets",
      "/pets/{petId}",
    ]);
  });

  it("records the properties an import cannot be created with", async () => {
    // Given a template asking for a description and a disabled endpoint
    // alongside its Body
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        paths: petPaths,
        apiProperties: {
          Description: "The pets API",
          DisableExecuteApiEndpoint: true,
        },
      }),
    );

    // Then the stack deploys and says which properties the API was created
    // without, since ImportRestApi takes neither
    expect(ignoredReasons(stack)).toStrictEqual([
      "Api AWS::ApiGateway::RestApi property Description is not applied: " +
        "ImportRestApi does not take it, and nothing here changes an API " +
        "after it is created, so the API is created without it where real " +
        "AWS would apply it in a second step",
      "Api AWS::ApiGateway::RestApi property DisableExecuteApiEndpoint is " +
        "not applied: ImportRestApi does not take it, and nothing here " +
        "changes an API after it is created, so the API is created without " +
        "it where real AWS would apply it in a second step",
    ]);
  });

  it("refuses a Resource adding to an API the document declares", async () => {
    // Given a template declaring the API as a document and a path tree node
    // beside it
    const simAws = simAwsInEuWest2();
    const failure = await deployRestApiFailure(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        paths: petPaths,
        resources: {
          OwnersResource: {
            Type: "AWS::ApiGateway::Resource",
            Properties: {
              RestApiId: { Ref: "Api" },
              ParentId: { "Fn::GetAtt": ["Api", "RootResourceId"] },
              PathPart: "owners",
            },
          },
        },
      }),
    );

    // Then the stack fails naming both Resources, rather than deploying an API
    // written two ways at once
    expect(failure.message).toMatch(
      /AWS::ApiGateway::Resource OwnersResource cannot be deployed: REST API .* is declared as an OpenAPI document by Api/,
    );
  });

  it("records a FailOnWarnings on an API with nothing to import", async () => {
    // Given a template carrying the property and no Body
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(simAws, {
      Resources: {
        Api: {
          Type: "AWS::ApiGateway::RestApi",
          Properties: { Name: "pets", FailOnWarnings: true },
        },
      },
    });

    // Then the stack deploys and says the property means nothing here, since
    // there are no import warnings without an import
    expect(ignoredReasons(stack)).toStrictEqual([
      "Api AWS::ApiGateway::RestApi property FailOnWarnings is not applied: " +
        "it says what to do with the warnings an OpenAPI import finds, and " +
        "nothing is imported for this Resource",
    ]);
  });

  it("records a Swagger 2.0 Body and deploys the API without it", async () => {
    // Given a template whose document is the other specification, which is
    // what SAM writes for an AWS::Serverless::Api by default
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        paths: petPaths,
        apiProperties: { Name: "pets", Body: swaggerDefinition },
      }),
    );

    // Then the API deploys with an empty path tree and the record says why,
    // since a template carrying one deploys on AWS
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId: apiIdOf(apiUrl) }));
    expect(resources.items.map((resource) => resource.path)).toStrictEqual([
      "/",
    ]);
    expect(ignoredReasons(stack)).toStrictEqual([
      "Api AWS::ApiGateway::RestApi property Body is not applied: it is a " +
        "Swagger 2.0 document and only OpenAPI 3.0.x is read. The API is " +
        "created with an empty path tree. Declare the definition as OpenAPI " +
        "3.0.x to have it imported.",
    ]);
  });

  it("fails the Resource on a document it cannot import", async () => {
    // Given an OpenAPI 3 document whose integration this simulation cannot
    // create
    const simAws = simAwsInEuWest2();
    const failure = await deployRestApiFailure(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        paths: {
          "/pets": {
            get: {
              "x-amazon-apigateway-integration": {
                ...simCfnImportedRestApiIntegration,
                passthroughBehavior: "when_no_match",
              },
            },
          },
        },
      }),
    );

    // Then the stack fails naming the member, since an API deployed with an
    // empty tree would answer 403 for every path the document declared
    expect(failure.message).toMatch(
      /#\/paths\/~1pets\/get\/x-amazon-apigateway-integration\/passthroughBehavior/,
    );
  });

  it("deploys the authorizer a security scheme declares", async () => {
    // Given a template whose document gates its operation with a Lambda
    // authorizer, pointed at the function the same stack deploys
    const simAws = simAwsInEuWest2();
    const stack = await deployRestApi(
      simAws,
      simCfnImportedRestApiTemplateFactory.make({
        paths: {
          "/pets": {
            get: {
              security: [{ "pet-authorizer": [] }],
              "x-amazon-apigateway-integration":
                simCfnImportedRestApiIntegration,
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
                authorizerUri: { "Fn::GetAtt": ["Handler", "Arn"] },
              },
            },
          },
        },
      }),
    );

    // Then the deployed API carries the authorizer the scheme named, with the
    // function URI the template resolved, and its method sends requests
    // through it
    const apiUrl = stack.outputs.get("ApiUrl")?.value;
    assertTypeString(apiUrl);
    const restApiId = apiIdOf(apiUrl);
    const authorizers = await simAws
      .apiGateway()
      .getAuthorizers(new GetAuthorizersCommand({ restApiId }));
    const [authorizer] = authorizers.items;
    assertNonNullable(authorizer);
    assertIdentical(authorizer.name, "pet-authorizer");
    assertIdentical(authorizer.type, "TOKEN");
    expect(authorizer.authorizerUri).toMatch(/:function:pets$/u);

    const resources = await simAws
      .apiGateway()
      .getResources(new GetResourcesCommand({ restApiId }));
    const pets = resources.items.find((resource) => resource.path === "/pets");
    assertNonNullable(pets);
    const method = await simAws.apiGateway().getMethod(
      new GetMethodCommand({
        restApiId,
        resourceId: pets.id,
        httpMethod: "GET",
      }),
    );
    assertIdentical(method.authorizationType, "CUSTOM");
    assertIdentical(method.authorizerId, authorizer.id);
  });
});
