import {
  CreateApiCommand,
  DeleteApiCommand,
  GetApiCommand,
  GetApisCommand,
} from "@aws-sdk/client-apigatewayv2";
import {
  assertFalse,
  assertIdentical,
  assertStringMatches,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimApiGatewayV2NotFound } from "../../error/sim-api-gateway-v2.error.js";

describe("Sim API Gateway v2 API commands", () => {
  it("creates an HTTP API with a generated endpoint", async () => {
    // Given a simulated AWS in its default Region
    const simAws = new SimAws();

    // When an HTTP API is created
    const created = await simAws.apiGatewayV2().createApi(
      new CreateApiCommand({
        Name: "orders",
        ProtocolType: "HTTP",
        Description: "Order intake",
      }),
    );

    // Then the API has the id and endpoint real API Gateway would give it
    assertStringMatches(created.ApiId, /^[a-z0-9]{10}$/);
    assertIdentical(
      created.ApiEndpoint,
      `https://${created.ApiId}.execute-api.us-east-1.amazonaws.com`,
    );
    assertIdentical(created.Name, "orders");
    assertIdentical(created.ProtocolType, "HTTP");
    assertIdentical(created.Description, "Order intake");
    assertFalse(created.DisableExecuteApiEndpoint);
  });

  it("gives each API its own id", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When two APIs are created with the same name, which real API Gateway
    // allows because a name is not an identity there
    const first = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    const second = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // Then only the ids tell them apart
    expect(second.ApiId).not.toBe(first.ApiId);
  });

  it("gets an API by id", async () => {
    // Given a created API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When it is fetched by id
    const fetched = await simAws
      .apiGatewayV2()
      .getApi(new GetApiCommand({ ApiId: apiId }));

    // Then it reports what it was created with
    assertIdentical(fetched.ApiId, apiId);
    assertIdentical(fetched.Name, "orders");
    assertUndefined(fetched.Description);
  });

  it("refuses to get an API that does not exist", async () => {
    // Given a simulated AWS with no APIs in it
    const simAws = new SimAws();

    // When an id nothing was created with is fetched
    // Then it is reported as not found
    await expect(
      simAws.apiGatewayV2().getApi(new GetApiCommand({ ApiId: "abcdefghij" })),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("lists the APIs of one Account and Region", async () => {
    // Given two APIs in this scope and one in another Region
    const simAws = new SimAws();
    await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "billing", ProtocolType: "HTTP" }),
      );
    await simAws
      .account()
      .region("eu-west-2")
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "elsewhere", ProtocolType: "HTTP" }),
      );

    // When this scope's APIs are listed
    const { Items: items } = await simAws
      .apiGatewayV2()
      .getApis(new GetApisCommand({}));

    // Then the other Region's API is not among them, because API Gateway
    // state does not cross a Region boundary
    expect(items.map((api) => api.Name)).toStrictEqual(["orders", "billing"]);
  });

  it("deletes an API", async () => {
    // Given a created API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When it is deleted
    await simAws
      .apiGatewayV2()
      .deleteApi(new DeleteApiCommand({ ApiId: apiId }));

    // Then nothing holds it any more
    const { Items: items } = await simAws
      .apiGatewayV2()
      .getApis(new GetApisCommand({}));
    expect(items).toStrictEqual([]);
    await expect(
      simAws.apiGatewayV2().getApi(new GetApiCommand({ ApiId: apiId })),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("stamps the API with the simulation's own clock", async () => {
    // Given a simulated AWS whose clock is stopped at a known instant
    const instant = new Date("2026-08-02T11:00:00.000Z");
    const simAws = new SimAws();
    await simAws.clock().setTo(instant);

    // When an API is created
    const created = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // Then its creation time is the simulation's now, not the host clock's
    assertIdentical(created.CreatedDate.getTime(), instant.getTime());
  });
});
