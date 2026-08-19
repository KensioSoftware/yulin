import {
  CreateDeploymentCommand,
  ImportRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import {
  simRestApiInvokePermission,
  simRestApiProxyFunction,
} from "../api/sim-rest-api-proxy-function.js";
import { simRestApiOpenApiDocumentFactory } from "./sim-rest-api-openapi-document.factory.js";
import { simRestApiOpenApiIntegrationFactory } from "./sim-rest-api-openapi-integration.factory.js";

const functionName = "pets";
const functionAccountId = "888888888888";

describe("Serving a request through an imported sim REST API", () => {
  it("routes a request to the function the document named", async () => {
    // Given a function, and a document declaring a parameterised path in front
    // of it
    const simAws = new SimAws();
    const functionArn = await simRestApiProxyFunction(simAws, {
      functionAccountId,
      functionName,
      roleArn: "arn:aws:iam::888888888888:role/PetsRole",
      handler: (event: SimPayload1Event): unknown => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: `pet ${event.pathParameters?.["petId"] ?? "none"}`,
      }),
    });
    const document = simRestApiOpenApiDocumentFactory.make({
      paths: {
        "/pets/{petId}": {
          get: {
            "x-amazon-apigateway-integration":
              simRestApiOpenApiIntegrationFactory.make({ functionArn }),
          },
        },
      },
    });

    // When the document is imported and the API is deployed to a stage
    const body = new TextEncoder().encode(JSON.stringify(document));
    const imported = await simAws
      .apiGateway()
      .importRestApi(new ImportRestApiCommand({ body }));
    await simRestApiInvokePermission(
      simAws,
      { functionAccountId, functionName },
      imported.id,
    );
    const deployment = new CreateDeploymentCommand({
      restApiId: imported.id,
      stageName: "prod",
    });
    await simAws.apiGateway().createDeployment(deployment);

    // Then a request to the imported path reaches the function, with the path
    // parameter the template names
    const restApi = simAws.apiGateway().findRestApi(imported.id);
    assertNonNullable(restApi);
    const url = new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}/pets/42`,
    });
    const response = await new SimAwsHttp({ simAws }).fetch(url.toString());

    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "pet 42");
  });
});
