import {
  CreateRestApiCommand,
  GetResourcesCommand,
  GetRestApisCommand,
} from "@aws-sdk/client-api-gateway";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimApiGatewayBadRequest } from "../error/sim-api-gateway.error.js";

describe("Sim API Gateway REST API input validation", () => {
  it("requires the name a REST API is created under", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When an API is created without a name, which the SDK types rule out and
    // a hand-built or generated request does not
    const created = simAws.apiGateway().createRestApi({ input: {} });

    // Then it is refused
    await expect(created).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(created).rejects.toThrow("CreateRestApi requires name");
  });

  it("refuses an option it would otherwise drop", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When an API is created with an endpoint configuration
    const created = simAws.apiGateway().createRestApi(
      new CreateRestApiCommand({
        name: "orders",
        endpointConfiguration: { types: ["PRIVATE"] },
      }),
    );

    // Then it is refused, because an option dropped here would look applied to
    // the request that sent it and unapplied to everything else
    await expect(created).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(created).rejects.toThrow(
      "endpointConfiguration is not simulated",
    );
  });

  it("refuses a paged request, since every list answers in full", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When a list asks for a page
    const listed = simAws
      .apiGateway()
      .getRestApis(new GetRestApisCommand({ limit: 10 }));

    // Then it is refused rather than answered in full under a paging request
    await expect(listed).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(listed).rejects.toThrow("paging is not simulated");
  });

  it("refuses an embed it does not build", async () => {
    // Given a REST API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When the resources are asked for something other than their methods
    const listed = simAws.apiGateway().getResources(
      new GetResourcesCommand({
        restApiId: created.id,
        embed: ["integration"],
      }),
    );

    // Then it is refused
    await expect(listed).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(listed).rejects.toThrow(
      "embed 'integration' is not simulated",
    );
  });
});
