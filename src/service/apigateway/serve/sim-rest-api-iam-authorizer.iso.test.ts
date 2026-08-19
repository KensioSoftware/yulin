import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertIdentical, assertObjectMatches } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1RequestContext } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

const accountId = "888888888888";
const reporterArn = `arn:aws:iam::${accountId}:role/Reporter`;

/**
 * A handler reporting its own requestContext, so a test can assert on what the
 * method's authorization told it about the caller rather than only on the
 * status.
 */
const reportContext = (event: {
  requestContext: SimPayload1RequestContext;
}): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext),
});

/**
 * A Role in the API's own Account, allowed to invoke one `execute-api`
 * resource.
 */
async function reporterRole(simAws: SimAws, resource: string): Promise<void> {
  const iam = simAws.iam();
  await iam.createRole(
    new CreateRoleCommand({
      RoleName: "Reporter",
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: `arn:aws:iam::${accountId}:root` },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Reporter",
      PolicyName: "InvokeOrders",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "execute-api:Invoke", Resource: resource },
      }),
    }),
  );
}

function get(
  simAws: SimAws,
  restApi: SimRestApi,
  path: string,
  callerArn?: string,
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}${path}`,
    }).toString(),
    callerArn === undefined
      ? {}
      : { headers: { [simAwsCallerHeaderName]: callerArn } },
  );
}

/**
 * The ARN of one method of an API, as an identity policy names it.
 */
function methodArn(restApi: SimRestApi, methodAndPath: string): string {
  return (
    `arn:aws:execute-api:us-east-1:${accountId}:` +
    `${restApi.apiId}/prod/${methodAndPath}`
  );
}

describe("Authorizing a sim REST API method with AWS_IAM", () => {
  it("refuses an unsigned request and never invokes the integration", async () => {
    // Given an AWS_IAM method
    const simAws = new SimAws();
    let invocations = 0;
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        resourcePaths: ["/orders/{orderId}"],
        handler: (): unknown => {
          invocations += 1;

          return { statusCode: 200, body: "one order" };
        },
      },
      simAws,
    );

    // When it is called with no credentials at all
    const response = await get(simAws, restApi, "/orders/42");

    // Then the request resolved to an anonymous caller, nothing allows that
    // caller anything, and the handler never ran
    assertIdentical(response.status, 403);
    assertIdentical(invocations, 0);
  });

  it("admits a caller allowed execute-api:Invoke on the method", async () => {
    // Given an AWS_IAM method and a Role allowed to invoke it
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        resourcePaths: ["/orders/{orderId}"],
        handler: (): unknown => ({ statusCode: 200, body: "one order" }),
      },
      simAws,
    );
    await reporterRole(simAws, methodArn(restApi, "GET/orders/*"));

    // When that Role calls it
    const response = await get(simAws, restApi, "/orders/42", reporterArn);

    // Then the handler ran
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "one order");
  });

  it("refuses a caller whose policies allow another method of the API", async () => {
    // Given an API with two AWS_IAM methods, and a Role allowed one of them
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        resourcePaths: ["/orders/{orderId}", "/invoices/{invoiceId}"],
        handler: (): unknown => ({ statusCode: 200, body: "one order" }),
      },
      simAws,
    );
    await reporterRole(simAws, methodArn(restApi, "GET/orders/*"));

    // When that Role calls each of them
    const allowed = await get(simAws, restApi, "/orders/42", reporterArn);
    const other = await get(simAws, restApi, "/invoices/42", reporterArn);

    // Then being allowed one method of the API leaves the other closed, since
    // the policy is evaluated against the ARN of the request being made
    assertIdentical(allowed.status, 200);
    assertIdentical(other.status, 403);
  });

  it("refuses a caller whose policies allow no execute-api action", async () => {
    // Given an AWS_IAM method and a Role allowed to read a Bucket instead
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { iamAuthorization: true, resourcePaths: ["/orders/{orderId}"] },
      simAws,
    );
    await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Reporter",
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
        RoleName: "Reporter",
        PolicyName: "ReadReports",
        PolicyDocument: simIamPolicyDocumentFactory.make({
          Statement: { Action: "s3:GetObject", Resource: "*" },
        }),
      }),
    );

    // When that Role calls the method
    const response = await get(simAws, restApi, "/orders/42", reporterArn);

    // Then being a known principal is not enough, and the body is the one API
    // Gateway answers a caller its policies left short
    assertIdentical(response.status, 403);
    assertIdentical(
      await response.text(),
      '{"Message":"User is not authorized to access this resource"}',
    );
  });

  it("lets an explicit Deny beat an Allow", async () => {
    // Given a Role allowed every API and denied this one method
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { iamAuthorization: true, resourcePaths: ["/orders/{orderId}"] },
      simAws,
    );
    await reporterRole(simAws, "*");
    const denyOrders = simIamPolicyDocumentFactory.make({
      Statement: {
        Effect: "Deny",
        Action: "execute-api:Invoke",
        Resource: methodArn(restApi, "GET/orders/*"),
      },
    });
    await simAws.iam().putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "Reporter",
        PolicyName: "DenyOrders",
        PolicyDocument: denyOrders,
      }),
    );

    // When that Role calls the denied method
    const response = await get(simAws, restApi, "/orders/42", reporterArn);

    // Then the Deny wins, as it does in any IAM evaluation
    assertIdentical(response.status, 403);
  });

  it("describes the admitted caller in the event identity", async () => {
    // Given an admitted caller on an AWS_IAM method
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        iamAuthorization: true,
        resourcePaths: ["/orders/{orderId}"],
        handler: reportContext,
      },
      simAws,
    );
    await reporterRole(simAws, "*");

    // When the handler reads its invocation event
    const response = await get(simAws, restApi, "/orders/42", reporterArn);
    const context = (await response.json()) as SimPayload1RequestContext;

    // Then it can tell who called it and from which Account, which is the
    // point of the authorization type for handler code
    assertObjectMatches(context.identity, {
      accountId,
      caller: reporterArn,
      user: reporterArn,
      userArn: reporterArn,
    });
  });

  it("names nobody in the identity of an open method", async () => {
    // Given a method that authorizes nobody
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { resourcePaths: ["/orders/{orderId}"], handler: reportContext },
      simAws,
    );

    // When a request reaches the handler, caller header and all
    const response = await get(simAws, restApi, "/orders/42", reporterArn);
    const context = (await response.json()) as SimPayload1RequestContext;

    // Then nothing authorized that caller, so the identity names no principal,
    // and the fields are null rather than absent
    assertIdentical(response.status, 200);
    assertObjectMatches(context.identity, {
      accountId: null,
      caller: null,
      user: null,
      userArn: null,
    });
  });
});
