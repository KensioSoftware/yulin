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

    // When an integration names a published function version, which simulated
    // Lambda has no notion of
    // Then it is refused rather than invoking the unpublished function
    await expect(
      simAws.apiGatewayV2().createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: `${functionArn}:PROD`,
          PayloadFormatVersion: "2.0",
        }),
      ),
    ).rejects.toThrow(SimApiGatewayV2BadRequest);
  });
});
