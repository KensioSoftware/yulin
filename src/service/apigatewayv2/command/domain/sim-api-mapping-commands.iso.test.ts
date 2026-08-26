import {
  CreateApiCommand,
  CreateApiMappingCommand,
  CreateDomainNameCommand,
  CreateStageCommand,
  DeleteApiMappingCommand,
  GetApiMappingCommand,
  GetApiMappingsCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2Conflict,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

/**
 * An API with one stage, and a domain name with nothing mapped to it yet,
 * which is what every mapping command here starts from.
 */
async function domainAndApi(
  simAws: SimAws,
  stageName = "$default",
): Promise<string> {
  const { ApiId: apiId } = await simAws
    .apiGatewayV2()
    .createApi(new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }));
  await simAws.apiGatewayV2().createStage(
    new CreateStageCommand({
      ApiId: apiId,
      StageName: stageName,
      AutoDeploy: true,
    }),
  );
  await simAws
    .apiGatewayV2()
    .createDomainName(
      new CreateDomainNameCommand({ DomainName: "api.example.test" }),
    );

  return apiId;
}

describe("Sim API Gateway v2 API mapping commands", () => {
  it("maps the root of a domain to an API and a stage", async () => {
    // Given a domain name and an API with a stage
    const simAws = new SimAws();
    const apiId = await domainAndApi(simAws);

    // When the domain is mapped with no base path
    const created = await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: "api.example.test",
        ApiId: apiId,
        Stage: "$default",
      }),
    );

    // Then the mapping serves the API at the root of the domain, which is
    // what an empty ApiMappingKey reports
    assertIdentical(created.ApiId, apiId);
    assertIdentical(created.Stage, "$default");
    assertIdentical(created.ApiMappingKey, "");
    expect(created.ApiMappingId).toMatch(/^[a-z0-9]{6}$/u);
  });

  it("maps a base path of a domain", async () => {
    // Given a domain name and an API with a named stage
    const simAws = new SimAws();
    const apiId = await domainAndApi(simAws, "dev");

    // When a multi-segment base path is mapped
    const created = await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: "api.example.test",
        ApiId: apiId,
        Stage: "dev",
        ApiMappingKey: "orders/v1",
      }),
    );

    // Then the mapping reports the base path it serves
    assertIdentical(created.ApiMappingKey, "orders/v1");
    assertIdentical(created.Stage, "dev");
  });

  it("refuses a base path that could never match a request", async () => {
    // Given a domain name and an API with a stage
    const simAws = new SimAws();
    const apiId = await domainAndApi(simAws);

    // When a base path is written with a leading slash
    // Then it is refused rather than trimmed, since trimming would serve the
    // API under a base path the command was never given
    await expect(
      simAws.apiGatewayV2().createApiMapping(
        new CreateApiMappingCommand({
          DomainName: "api.example.test",
          ApiId: apiId,
          Stage: "$default",
          ApiMappingKey: "/orders",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses a second mapping of the same base path", async () => {
    // Given a domain already mapping its root
    const simAws = new SimAws();
    const apiId = await domainAndApi(simAws);
    await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: "api.example.test",
        ApiId: apiId,
        Stage: "$default",
      }),
    );

    // When the root is mapped again
    // Then it is refused, since one base path serves one API
    await expect(
      simAws.apiGatewayV2().createApiMapping(
        new CreateApiMappingCommand({
          DomainName: "api.example.test",
          ApiId: apiId,
          Stage: "$default",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2Conflict);
  });

  it("refuses a mapping naming a stage the API does not have", async () => {
    // Given a domain name and an API with only its default stage
    const simAws = new SimAws();
    const apiId = await domainAndApi(simAws);

    // When a mapping names another stage
    // Then it is refused here rather than answering 404 on every request
    await expect(
      simAws.apiGatewayV2().createApiMapping(
        new CreateApiMappingCommand({
          DomainName: "api.example.test",
          ApiId: apiId,
          Stage: "dev",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("refuses a mapping naming an API that is not there", async () => {
    // Given a domain name
    const simAws = new SimAws();
    await domainAndApi(simAws);

    // When a mapping names an API id nothing allocated
    // Then it is refused
    await expect(
      simAws.apiGatewayV2().createApiMapping(
        new CreateApiMappingCommand({
          DomainName: "api.example.test",
          ApiId: "abcdefghij",
          Stage: "$default",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("reads its mappings back and forgets a deleted one", async () => {
    // Given a domain mapping two base paths
    const simAws = new SimAws();
    const apiId = await domainAndApi(simAws);
    const root = await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: "api.example.test",
        ApiId: apiId,
        Stage: "$default",
      }),
    );
    await simAws.apiGatewayV2().createApiMapping(
      new CreateApiMappingCommand({
        DomainName: "api.example.test",
        ApiId: apiId,
        Stage: "$default",
        ApiMappingKey: "orders",
      }),
    );

    // When one is read back and then deleted
    const fetched = await simAws.apiGatewayV2().getApiMapping(
      new GetApiMappingCommand({
        DomainName: "api.example.test",
        ApiMappingId: root.ApiMappingId,
      }),
    );
    await simAws.apiGatewayV2().deleteApiMapping(
      new DeleteApiMappingCommand({
        DomainName: "api.example.test",
        ApiMappingId: root.ApiMappingId,
      }),
    );
    const remaining = await simAws
      .apiGatewayV2()
      .getApiMappings(
        new GetApiMappingsCommand({ DomainName: "api.example.test" }),
      );

    // Then the deleted one is gone and the other one stays
    assertIdentical(fetched.ApiMappingId, root.ApiMappingId);
    expect(
      remaining.Items.map((mapping) => mapping.ApiMappingKey),
    ).toStrictEqual(["orders"]);
  });

  it("refuses a mapping on a domain name nothing created", async () => {
    // Given an API with a stage and no domain name for it
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When a mapping names a domain that is not there
    // Then it is refused
    await expect(
      simAws.apiGatewayV2().createApiMapping(
        new CreateApiMappingCommand({
          DomainName: "api.example.test",
          ApiId: apiId,
          Stage: "$default",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("refuses a command naming an API mapping the domain does not have", async () => {
    // Given a domain with no mappings
    const simAws = new SimAws();
    await domainAndApi(simAws);

    // When a mapping id nothing allocated is read back
    // Then it is refused
    await expect(
      simAws.apiGatewayV2().getApiMapping(
        new GetApiMappingCommand({
          DomainName: "api.example.test",
          ApiMappingId: "abc123",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });
});
