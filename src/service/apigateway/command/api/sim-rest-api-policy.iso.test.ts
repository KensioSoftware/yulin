import {
  CreateRestApiCommand,
  GetRestApiCommand,
  ImportRestApiCommand,
  UpdateRestApiCommand,
} from "@aws-sdk/client-api-gateway";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../../iam/policy/sim-iam-policy-document.factory.js";
import { SimApiGatewayBadRequest } from "../../error/sim-api-gateway.error.js";
import { simRestApiOpenApiDocumentFactory } from "../../openapi/sim-rest-api-openapi-document.factory.js";

const statement = {
  Effect: "Allow",
  Principal: "*",
  Action: "execute-api:Invoke",
  Resource: "execute-api:/*",
} as const;

/**
 * Read a policy as `GetRestApi` reports it, unescaping its quotes as a client
 * has to.
 */
function reported(policy: string | undefined): unknown {
  return policy === undefined
    ? undefined
    : JSON.parse(policy.replaceAll(String.raw`\"`, '"'));
}

describe("A sim REST API's resource policy commands", () => {
  it("expands the execute-api shorthand to the API's own ARN", async () => {
    // Given an API created with a policy naming itself by the shorthand
    const simAws = new SimAws();
    const created = await simAws.apiGateway().createRestApi(
      new CreateRestApiCommand({
        name: "orders",
        policy: simIamPolicyDocumentFactory.make({ Statement: statement }),
      }),
    );

    // When it is described
    const described = await simAws
      .apiGateway()
      .getRestApi(new GetRestApiCommand({ restApiId: created.id }));

    // Then the policy comes back escaped, naming the API's ARN
    expect(described.policy).toContain(String.raw`\"Effect\"`);
    expect(reported(described.policy)).toStrictEqual({
      Version: "2012-10-17",
      Statement: [
        {
          ...statement,
          Resource: `arn:aws:execute-api:us-east-1:888888888888:${created.id}/*`,
        },
      ],
    });
  });

  it("replaces and removes a policy with UpdateRestApi", async () => {
    // Given an API with no policy
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));
    const update = (value: string): Promise<{ policy?: string }> =>
      simAws.apiGateway().updateRestApi(
        new UpdateRestApiCommand({
          restApiId: created.id,
          patchOperations: [{ op: "replace", path: "/policy", value }],
        }),
      );

    // When a policy is attached, and then replaced with an empty value
    const attached = await update(
      simIamPolicyDocumentFactory.make({
        Statement: { ...statement, Resource: "arn:aws:execute-api:*" },
      }),
    );
    const removed = await update("");

    // Then the first holds the policy and the second none
    expect(reported(attached.policy)).toMatchObject({
      Statement: [{ Resource: "arn:aws:execute-api:*" }],
    });
    assertUndefined(removed.policy);
  });

  it("refuses a policy that is not an IAM policy document", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();

    // When an API is created with a policy that is not JSON
    const creating = simAws
      .apiGateway()
      .createRestApi(
        new CreateRestApiCommand({ name: "orders", policy: "allow all" }),
      );

    // Then it is refused as API Gateway refuses it
    await expect(creating).rejects.toThrow(SimApiGatewayBadRequest);
    await expect(creating).rejects.toThrow(/Invalid policy document/u);
  });

  it("refuses a policy statement naming no principal", async () => {
    // Given a simulated AWS
    const simAws = new SimAws();
    const { Principal: _principal, ...unaddressed } = statement;

    // When an API is created with a statement granting nobody in particular
    const creating = simAws.apiGateway().createRestApi(
      new CreateRestApiCommand({
        name: "orders",
        policy: simIamPolicyDocumentFactory.make({ Statement: unaddressed }),
      }),
    );

    // Then it is refused, as a resource policy has to name who it grants
    await expect(creating).rejects.toThrow(/Invalid policy document/u);
  });

  it("leaves an API unchanged by an update whose policy is refused", async () => {
    // Given an API
    const simAws = new SimAws();
    const created = await simAws
      .apiGateway()
      .createRestApi(new CreateRestApiCommand({ name: "orders" }));

    // When one update renames it and sets a policy that is not JSON
    const updating = simAws.apiGateway().updateRestApi(
      new UpdateRestApiCommand({
        restApiId: created.id,
        patchOperations: [
          { op: "replace", path: "/name", value: "renamed" },
          { op: "replace", path: "/policy", value: "allow all" },
        ],
      }),
    );

    // Then the update is refused and the name is the one it had
    await expect(updating).rejects.toThrow(SimApiGatewayBadRequest);
    const described = await simAws
      .apiGateway()
      .getRestApi(new GetRestApiCommand({ restApiId: created.id }));
    assertIdentical(described.name, "orders");
  });

  it("takes a policy from the document an API is imported from", async () => {
    // Given a document declaring a resource policy
    const simAws = new SimAws();
    const document = {
      ...simRestApiOpenApiDocumentFactory.make(),
      "x-amazon-apigateway-policy": {
        Version: "2012-10-17",
        Statement: [statement],
      },
    };

    const body = new TextEncoder().encode(JSON.stringify(document));

    // When it is imported
    const imported = await simAws
      .apiGateway()
      .importRestApi(new ImportRestApiCommand({ body }));

    // Then the API holds the policy, expanded
    const restApi = simAws.apiGateway().findRestApi(imported.id);
    assertIdentical(
      JSON.stringify(restApi?.policy?.document.Statement),
      JSON.stringify([
        {
          ...statement,
          Resource: `arn:aws:execute-api:us-east-1:888888888888:${imported.id}/*`,
        },
      ]),
    );
  });
});
