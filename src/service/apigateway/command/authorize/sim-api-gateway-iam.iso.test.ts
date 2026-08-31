import {
  CreateResourceCommand,
  CreateRestApiCommand,
  GetRestApisCommand,
} from "@aws-sdk/client-api-gateway";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertArrayEmpty, assertIdentical } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";

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

describe("Simulated IAM for API Gateway REST API commands", () => {
  it("allows a caller granted the HTTP method of the request", async () => {
    // Given a Role allowed to POST to the REST API collection, which is what
    // real API Gateway asks IAM about rather than a CreateRestApi action
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "apigateway:POST",
      Resource: `arn:aws:apigateway:${regionName}::/restapis`,
    });

    // When it creates an API
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }), { caller });

    // Then it is allowed
    assertIdentical(created.name, "orders");
  });

  it("refuses a caller granted only another method", async () => {
    // Given a Role that may read REST APIs but not create them
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "apigateway:GET",
      Resource: `arn:aws:apigateway:${regionName}::/restapis`,
    });

    // When it tries to create one
    const refused = simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }), { caller });

    // Then it is refused, since creating asks for apigateway:POST
    await expect(refused).rejects.toThrow("apigateway:POST");

    // And reading, which asks for apigateway:GET, is allowed
    const listed = await simAws
      .apiGateway()
      .getRestApis(new GetRestApisCommand({}), { caller });
    assertArrayEmpty(listed.items);
  });

  it("authorizes a child collection against its own path", async () => {
    // Given a Role allowed to POST to the API collection and nothing deeper
    const { simAws, caller } = await simAwsWithRole({
      Effect: "Allow",
      Action: "apigateway:POST",
      Resource: `arn:aws:apigateway:${regionName}::/restapis`,
    });
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }), { caller });

    // When it adds a resource, which addresses the API's own resources path
    const refused = simAws.apiGateway().createResource(
      new CreateResourceCommand({
        restApiId: created.id,
        parentId: created.rootResourceId,
        pathPart: "orders",
      }),
      { caller },
    );

    // Then it is refused, because the path the grant names stops short of it
    await expect(refused).rejects.toThrow(`/restapis/${created.id}/resources`);
  });
});
