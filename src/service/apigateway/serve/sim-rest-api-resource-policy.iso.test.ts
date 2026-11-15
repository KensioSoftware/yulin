import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertResponseStatus,
  assertStringEndsWith,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import type { SimIamPolicyDocumentStatement } from "../../iam/policy/sim-iam-policy.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simAwsSourceIpHeaderName } from "../../iam/request/sim-aws-source-ip-header.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

const otherAccountId = "222222222222";

/**
 * Attach a resource policy to an API through `UpdateRestApi`.
 */
async function attachPolicy(
  simAws: SimAws,
  restApi: SimRestApi,
  statements: readonly SimIamPolicyDocumentStatement[],
): Promise<void> {
  await simAws.apiGateway().updateRestApi({
    input: {
      restApiId: restApi.apiId,
      patchOperations: [
        {
          op: "replace",
          path: "/policy",
          value: simIamPolicyDocumentFactory.make({ Statement: statements }),
        },
      ],
    },
  });
}

function get(
  simAws: SimAws,
  restApi: SimRestApi,
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}${path}`,
    }).toString(),
    { headers },
  );
}

/**
 * A Role whose identity policies allow `execute-api:Invoke` on anything, or
 * nothing when `allowed` is false.
 */
async function invokerRole(
  simAws: SimAws,
  accountId: string,
  allowed: boolean,
): Promise<string> {
  const iam = simAws.account(accountId).iam();
  const created = await iam.createRole(
    new CreateRoleCommand({
      RoleName: "Invoker",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  if (allowed) {
    await iam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Invoker",
        PolicyName: "Invoke",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "execute-api:Invoke", Resource: "*" },
        }),
      }),
    );
  }

  return created.Role.Arn;
}

const allowEveryone: SimIamPolicyDocumentStatement = {
  Effect: "Allow",
  Principal: "*",
  Action: "execute-api:Invoke",
  Resource: "execute-api:/*",
};

describe("A sim REST API's resource policy", () => {
  it("admits a request to an open method only from the addresses it allows", async () => {
    // Given an open method behind a policy allowing one address range
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders"] },
      simAws,
    );
    await attachPolicy(simAws, restApi, [
      {
        ...allowEveryone,
        Condition: { IpAddress: { "aws:SourceIp": "192.0.2.0/24" } },
      },
    ]);

    // When it is called from inside the range, from outside it, and from
    // loopback, which is where a request naming no address comes from
    const inside = await get(simAws, restApi, "/orders", {
      [simAwsSourceIpHeaderName]: "192.0.2.10",
    });
    const outside = await get(simAws, restApi, "/orders", {
      [simAwsSourceIpHeaderName]: "198.51.100.10",
    });
    const loopback = await get(simAws, restApi, "/orders");

    // Then only the request from inside is served, and a refusal names the
    // anonymous caller and the request
    assertResponseStatus(inside, 200, await describeResponse(inside));
    assertResponseStatus(outside, 403, await describeResponse(outside));
    assertResponseStatus(loopback, 403, await describeResponse(loopback));
    assertIdentical(
      ((await outside.json()) as { Message: string }).Message,
      `User: anonymous is not authorized to perform: execute-api:Invoke on ` +
        `resource: arn:aws:execute-api:us-east-1:********8888:` +
        `${restApi.apiId}/prod/GET/orders`,
    );
  });

  it("refuses an open method a Deny statement covers", async () => {
    // Given an open API whose policy allows everything and denies one path
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders", "/admin"] },
      simAws,
    );
    await attachPolicy(simAws, restApi, [
      allowEveryone,
      { ...allowEveryone, Effect: "Deny", Resource: "execute-api:/*/*/admin" },
    ]);

    // When both paths are called
    const orders = await get(simAws, restApi, "/orders");
    const admin = await get(simAws, restApi, "/admin");

    // Then the denied path is refused with the explicit deny body
    assertResponseStatus(orders, 200, await describeResponse(orders));
    assertResponseStatus(admin, 403, await describeResponse(admin));
    assertStringEndsWith(
      ((await admin.json()) as { Message: string }).Message,
      "with an explicit deny",
    );
  });

  it("treats an open method's caller as anonymous whoever it names", async () => {
    // Given an open method behind a policy allowing one Role only
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders"] },
      simAws,
    );
    const roleArn = await invokerRole(simAws, "888888888888", true);
    await attachPolicy(simAws, restApi, [
      { ...allowEveryone, Principal: { AWS: roleArn } },
    ]);

    // When that Role is named as the caller
    const response = await get(simAws, restApi, "/orders", {
      [simAwsCallerHeaderName]: roleArn,
    });

    // Then it is refused, as API Gateway authenticates nobody for an open
    // method and a policy naming an AWS principal needs AWS_IAM methods
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("admits a Role of the API's Account that only the policy allows", async () => {
    // Given an AWS_IAM method, and a Role with no identity policy that the
    // API's policy allows
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { iamAuthorization: true, resourcePaths: ["/orders"] },
      simAws,
    );
    const roleArn = await invokerRole(simAws, "888888888888", false);
    await attachPolicy(simAws, restApi, [
      { ...allowEveryone, Principal: { AWS: roleArn } },
    ]);

    // When that Role calls the method
    const response = await get(simAws, restApi, "/orders", {
      [simAwsCallerHeaderName]: roleArn,
    });

    // Then either side allowing it is enough within one Account
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("needs both sides to allow a Role of another Account", async () => {
    // Given an AWS_IAM method whose policy allows another Account's Role,
    // and two such Roles, one with an identity policy allowing the call
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { iamAuthorization: true, resourcePaths: ["/orders"] },
      simAws,
    );
    const allowedArn = await invokerRole(simAws, otherAccountId, true);
    const bareArn = await invokerRole(simAws, "333333333333", false);
    await attachPolicy(simAws, restApi, [
      { ...allowEveryone, Principal: { AWS: [allowedArn, bareArn] } },
    ]);

    // When each Role calls the method
    const allowed = await get(simAws, restApi, "/orders", {
      [simAwsCallerHeaderName]: allowedArn,
    });
    const bare = await get(simAws, restApi, "/orders", {
      [simAwsCallerHeaderName]: bareArn,
    });

    // Then only the Role its own policies also allow is admitted
    assertResponseStatus(allowed, 200, await describeResponse(allowed));
    assertResponseStatus(bare, 403, await describeResponse(bare));
  });

  it("refuses a CUSTOM method's request it denies before the authorizer runs", async () => {
    // Given a method behind a Lambda authorizer allowing everything, and a
    // policy denying every request
    const simAws = new SimAws();
    let authorizations = 0;
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders"],
        authorizerHandler: (event: { methodArn: string }): unknown => {
          authorizations += 1;

          return {
            principalId: "user",
            policyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: "execute-api:Invoke",
                  Resource: event.methodArn,
                },
              ],
            },
          };
        },
      },
      simAws,
    );
    await attachPolicy(simAws, restApi, [{ ...allowEveryone, Effect: "Deny" }]);

    // When it is called with a token
    const response = await get(simAws, restApi, "/orders", {
      authorization: "allow",
    });

    // Then the policy refuses it and the authorizer is never invoked
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(authorizations, 0);
  });

  it("lets a CUSTOM method's authorizer decide where the policy only allows", async () => {
    // Given a method behind a Lambda authorizer allowing everything, and a
    // policy allowing everyone
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        resourcePaths: ["/orders"],
        authorizerHandler: (event: { methodArn: string }): unknown => ({
          principalId: "user",
          policyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Action: "execute-api:Invoke",
                Resource: event.methodArn,
              },
            ],
          },
        }),
      },
      simAws,
    );
    await attachPolicy(simAws, restApi, [allowEveryone]);

    // When it is called with a token
    const response = await get(simAws, restApi, "/orders", {
      authorization: "allow",
    });

    // Then the authorizer admits it
    assertResponseStatus(response, 200, await describeResponse(response));
  });
});
