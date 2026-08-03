import { ImportApiCommand } from "@aws-sdk/client-apigatewayv2";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simHttpApiOpenApiDocumentFactory } from "../../openapi/sim-http-api-openapi-document.factory.js";

const body = JSON.stringify(simHttpApiOpenApiDocumentFactory.make());

describe("Sim API Gateway v2 ImportApi input", () => {
  it("requires a document to import", async () => {
    // Given an ImportApi with nothing to read
    const simAws = new SimAws();

    // When it is sent
    const importing = simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: "" }));

    // Then it is refused, since the document is the whole declaration
    await expect(importing).rejects.toThrow("ImportApi requires Body");
  });

  it("refuses the lenient half of FailOnWarnings", async () => {
    // Given an import asking for warnings not to fail it
    const simAws = new SimAws();

    // When it is sent
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: body,
        FailOnWarnings: false,
      }),
    );

    // Then it is refused by name, because everything this simulation cannot
    // apply is refused rather than warned about
    await expect(importing).rejects.toThrow(
      "ImportApi FailOnWarnings false is not simulated",
    );
  });

  it("refuses a base path", async () => {
    // Given an import asking to serve the document under a path
    const simAws = new SimAws();

    // When it is sent
    const importing = simAws.apiGatewayV2().importApi(
      new ImportApiCommand({
        Body: body,
        Basepath: "/v1",
      }),
    );

    // Then it is refused by name, since a base path changes the path every
    // route of the API matches on
    await expect(importing).rejects.toThrow(
      "ImportApi Basepath is not simulated",
    );
  });
});
