import {
  CreateApiCommand,
  CreateIntegrationCommand,
  GetIntegrationsCommand,
} from "@aws-sdk/client-apigatewayv2";
import { assertIdentical, assertTrue } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimApiGatewayV2BadRequest,
  SimApiGatewayV2NotFound,
} from "../../error/sim-api-gateway-v2.error.js";

const functionArn = "arn:aws:lambda:us-east-1:111111111111:function:orders";

describe("Sim API Gateway v2 integration commands", () => {
  it("creates a Lambda proxy integration", async () => {
    // Given an API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When an AWS_PROXY integration is created for a function
    const created = await simAws.apiGatewayV2().createIntegration(
      new CreateIntegrationCommand({
        ApiId: apiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: functionArn,
        PayloadFormatVersion: "2.0",
        Description: "Order intake",
      }),
    );

    // Then it reports the integration API Gateway would have made
    assertTrue(
      /^[a-z0-9]+$/.test(created.IntegrationId),
      `Unexpected integration id ${created.IntegrationId}`,
    );
    assertIdentical(created.IntegrationType, "AWS_PROXY");
    assertIdentical(created.IntegrationUri, functionArn);
    assertIdentical(created.PayloadFormatVersion, "2.0");
    assertIdentical(created.Description, "Order intake");
  });

  it("lists the integrations of one API", async () => {
    // Given two APIs, one with an integration
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );
    const other = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "billing", ProtocolType: "HTTP" }),
      );
    const { IntegrationId: integrationId } = await simAws
      .apiGatewayV2()
      .createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "2.0",
        }),
      );

    // When each API's integrations are listed
    const listed = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: apiId }));
    const listedForOther = await simAws
      .apiGatewayV2()
      .getIntegrations(new GetIntegrationsCommand({ ApiId: other.ApiId }));

    // Then an integration belongs to the API it was created on and no other
    expect(listed.Items.map((item) => item.IntegrationId)).toStrictEqual([
      integrationId,
    ]);
    expect(listedForOther.Items).toStrictEqual([]);
  });

  it("refuses an integration on an API that does not exist", async () => {
    // Given a simulated AWS with no APIs in it
    const simAws = new SimAws();

    // When an integration is created against an unknown API id
    // Then it is reported as not found
    await expect(
      simAws.apiGatewayV2().createIntegration(
        new CreateIntegrationCommand({
          ApiId: "abcdefghij",
          IntegrationType: "AWS_PROXY",
          IntegrationUri: functionArn,
          PayloadFormatVersion: "2.0",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2NotFound);
  });

  it("refuses an integration URI that is not a Lambda function ARN", async () => {
    // Given an API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When an integration names an HTTP endpoint, which is what an HTTP_PROXY
    // integration points at
    // Then it is refused rather than created with nothing to invoke
    await expect(
      simAws.apiGatewayV2().createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: "https://orders.example.com/intake",
          PayloadFormatVersion: "2.0",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });

  it("creates an integration on a version or an alias", async () => {
    // Given an API
    const simAws = new SimAws();
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
      );

    // When one integration names an alias and another names a version number,
    // written in the API Gateway path form
    const alias = await simAws.apiGatewayV2().createIntegration(
      new CreateIntegrationCommand({
        ApiId: apiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: `${functionArn}:live`,
        PayloadFormatVersion: "2.0",
      }),
    );
    const wrappedUri =
      `arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/` +
      `${functionArn}:3/invocations`;
    const version = await simAws.apiGatewayV2().createIntegration(
      new CreateIntegrationCommand({
        ApiId: apiId,
        IntegrationType: "AWS_PROXY",
        IntegrationUri: wrappedUri,
        PayloadFormatVersion: "2.0",
      }),
    );

    // Then each is created, and each is handed back as it was written
    assertIdentical(alias.IntegrationUri, `${functionArn}:live`);
    assertIdentical(version.IntegrationUri, wrappedUri);
  });
});
