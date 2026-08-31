import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { simAwsAuthHeaderName } from "../../../serve/http/response/sim-aws-response-hints.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2RequestContext } from "../../../serve/payload-2/sim-payload-2-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

const accountId = "888888888888";

/**
 * A handler reporting its own requestContext, so a test can read the caller
 * the signature was attributed to.
 */
const reportContext = (event: {
  requestContext: SimPayload2RequestContext;
}): unknown => ({
  statusCode: 200,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(event.requestContext),
});

/**
 * A User with one identity policy, and the access key it signs with.
 */
async function signingUser(
  simAws: SimAws,
  resource: string,
): Promise<{ accessKeyId: string; secretAccessKey: string }> {
  const iam = simAws.iam();
  await iam.createUser(new CreateUserCommand({ UserName: "Reporter" }));
  await iam.putUserPolicy(
    new PutUserPolicyCommand({
      UserName: "Reporter",
      PolicyName: "InvokeOrders",
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: "execute-api:Invoke", Resource: resource },
      }),
    }),
  );
  const key = await iam.createAccessKey(
    new CreateAccessKeyCommand({ UserName: "Reporter" }),
  );

  return {
    accessKeyId: key.AccessKey.AccessKeyId,
    secretAccessKey: key.AccessKey.SecretAccessKey,
  };
}

/**
 * Sign a request to a route of the API, for the `execute-api` service and the
 * API's own Region, and serve it.
 */
async function signedGet(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
  credentials: { accessKeyId: string; secretAccessKey: string },
): Promise<Response> {
  const signed = await signAwsRequest({
    url: new SimAwsLocalUrl({
      input: `${api.apiEndpoint}${path}`,
    }).toString(),
    credentials,
    service: "execute-api",
    region: api.accountRegionScope.regionName,
  });

  return await new SimAwsHttp({ simAws }).handleRequest(signed.request);
}

async function iamApi(simAws: SimAws): Promise<SimHttpApi> {
  return await simHttpApiLambdaProxyFactory.make(
    {
      iamAuthorization: true,
      routeKeys: ["GET /orders/{orderId}"],
      handler: reportContext,
    },
    simAws,
  );
}

describe("Calling an AWS_IAM sim HTTP API route with a signed request", () => {
  it("admits a signed caller the API's Account allows", async () => {
    // Given an AWS_IAM route and a User allowed to invoke it
    const simAws = new SimAws();
    const api = await iamApi(simAws);
    const credentials = await signingUser(
      simAws,
      `arn:aws:execute-api:us-east-1:${accountId}:${api.apiId}` +
        `/$default/GET/orders/*`,
    );

    // When they sign a request to the route and it is served
    const response = await signedGet(simAws, api, "/orders/42", credentials);
    const context = (await response.json()) as SimPayload2RequestContext;

    // Then the signature identified them, and the handler was told who called
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(response.headers.get(simAwsAuthHeaderName), "sigv4");
    assertIdentical(
      context.authorizer?.iam?.userArn,
      `arn:aws:iam::${accountId}:user/Reporter`,
    );
  });

  it("refuses a signed caller with no matching Allow", async () => {
    // Given an AWS_IAM route and a User allowed something else entirely
    const simAws = new SimAws();
    const api = await iamApi(simAws);
    const credentials = await signingUser(simAws, "arn:aws:s3:::orders/*");

    // When they sign a request to the route and it is served
    const response = await signedGet(simAws, api, "/orders/42", credentials);

    // Then a sound signature is not enough: the request is authenticated but
    // not authorized
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(await response.text(), '{"message":"Forbidden"}');
  });

  it("serves a NONE route to a signed caller with no policies", async () => {
    // Given an open route, and a User allowed nothing at all
    const simAws = new SimAws();
    const api = await simHttpApiLambdaProxyFactory.make(
      { routeKeys: ["GET /health"], handler: reportContext },
      simAws,
    );
    const credentials = await signingUser(simAws, "arn:aws:s3:::orders/*");

    // When they sign a request to it
    const response = await signedGet(simAws, api, "/health", credentials);
    const context = (await response.json()) as SimPayload2RequestContext;

    // Then the route admits them, and describes no caller: a NONE route
    // authorizes nobody, so there is nothing for the event to report
    assertResponseStatus(response, 200, await describeResponse(response));
    assertUndefined(context.authorizer);
    assertIdentical(context.accountId, "anonymous");
  });

  it("refuses a signature for another service before the route is reached", async () => {
    // Given an AWS_IAM route and a User allowed to invoke it
    const simAws = new SimAws();
    const api = await iamApi(simAws);
    const credentials = await signingUser(simAws, "*");

    // When the request is signed for Lambda rather than for execute-api
    const signed = await signAwsRequest({
      url: new SimAwsLocalUrl({
        input: `${api.apiEndpoint}/orders/42`,
      }).toString(),
      credentials,
      service: "lambda",
      region: "us-east-1",
    });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the serving boundary refuses it before route authorization sees it,
    // with the capital-M body the boundary answers rather than the API's own
    assertResponseStatus(response, 403, await describeResponse(response));
    assertIdentical(await response.text(), '{"Message":"Forbidden"}');
  });
});
