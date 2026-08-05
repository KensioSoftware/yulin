import {
  CreateApiCommand,
  CreateIntegrationCommand,
  GetApisCommand,
  ImportApiCommand,
} from "@aws-sdk/client-apigatewayv2";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { simHttpApiOpenApiDocumentFactory } from "../../openapi/sim-http-api-openapi-document.factory.js";
import { simHttpApiOpenApiIntegrationFactory } from "../../openapi/sim-http-api-openapi-integration.factory.js";

const accountId = "111111111111";
const regionName = "eu-west-2";

/**
 * A simulated AWS with a Role whose only permissions are the ones the given
 * policy statement grants.
 */
async function simAwsWithRole(statement: object): Promise<{
  simAws: SimAws;
  caller: SimAwsCaller;
}> {
  const simAws = new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });

  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "ApiAuthor",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "ApiAuthor",
      PolicyName: "AuthorApis",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: statement,
      }),
    }),
  );

  return { simAws, caller: { kind: "arn", arn: role.Role.Arn } };
}

describe("Simulated IAM for API Gateway v2 commands", () => {
  it("allows a caller granted the HTTP method of the request", async () => {
    // Given a Role allowed to POST to the API collection, which is what real
    // API Gateway asks IAM about rather than a CreateApi action
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "apigateway:POST",
      Resource: `arn:aws:apigateway:${regionName}::/apis`,
    });

    // When it creates an API
    const created = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
        { caller },
      );

    // Then it is allowed
    assertIdentical(created.Name, "orders");
  });

  it("refuses a caller granted only another method", async () => {
    // Given a Role that may read APIs but not create them
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "apigateway:GET",
      Resource: `arn:aws:apigateway:${regionName}::/apis`,
    });

    // When it tries to create one
    const refused = simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
        { caller },
      );

    // Then it is denied, naming the action and the path-shaped resource
    await expect(refused).rejects.toThrow(
      /apigateway:POST.*arn:aws:apigateway:eu-west-2::\/apis/s,
    );

    // And it may still list them
    const listed = await simAws
      .apiGatewayV2()
      .getApis(new GetApisCommand({}), { caller });
    expect(listed.Items).toStrictEqual([]);
  });

  it("authorizes a child resource against its own path", async () => {
    // Given a Role allowed to POST anywhere under /apis except integrations
    const { simAws, caller } = await simAwsWithRole([
      {
        Effect: "Allow",
        Action: "apigateway:POST",
        Resource: `arn:aws:apigateway:${regionName}::/apis*`,
      },
      {
        Effect: "Deny",
        Action: "apigateway:POST",
        Resource: `arn:aws:apigateway:${regionName}::/apis/*/integrations`,
      },
    ]);
    const { ApiId: apiId } = await simAws
      .apiGatewayV2()
      .createApi(
        new CreateApiCommand({ Name: "orders", ProtocolType: "HTTP" }),
        { caller },
      );

    // When it adds an integration to the API it just created
    const refused = async (): Promise<unknown> =>
      await simAws.apiGatewayV2().createIntegration(
        new CreateIntegrationCommand({
          ApiId: apiId,
          IntegrationType: "AWS_PROXY",
          IntegrationUri: `arn:aws:lambda:${regionName}:${accountId}:function:orders`,
          PayloadFormatVersion: "2.0",
        }),
        { caller },
      );

    // Then the deny applies, because an integration is authorized against the
    // collection path under its API rather than against the API itself
    await expect(refused()).rejects.toThrow(
      `arn:aws:apigateway:${regionName}::/apis/${apiId}/integrations`,
    );
  });

  it("authorizes an import once, against the API collection", async () => {
    // Given a Role allowed to POST to the API collection and nothing under it
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "apigateway:POST",
      Resource: `arn:aws:apigateway:${regionName}::/apis`,
    });

    // When it imports a document declaring a route and an integration
    const integration = simHttpApiOpenApiIntegrationFactory.make({
      functionArn: `arn:aws:lambda:${regionName}:${accountId}:function:orders`,
      regionName,
    });
    const body = JSON.stringify(
      simHttpApiOpenApiDocumentFactory.make({
        paths: {
          "/orders": {
            get: { "x-amazon-apigateway-integration": integration },
          },
        },
      }),
    );
    const imported = await simAws
      .apiGatewayV2()
      .importApi(new ImportApiCommand({ Body: body }), { caller });

    // Then the whole import goes through, because it is one request rather
    // than one per resource it creates, which is what ImportApi is on AWS
    assertIdentical(imported.Name, "orders");
  });
});
