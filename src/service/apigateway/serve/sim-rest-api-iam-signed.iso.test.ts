import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { simAwsAuthHeaderName } from "../../../serve/http/response/sim-aws-response-hints.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1RequestContext } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

const accountId = "888888888888";

/**
 * A handler reporting its own requestContext, so a test can read the caller
 * the signature was attributed to.
 */
const reportContext = (event: {
  requestContext: SimPayload1RequestContext;
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
 * Sign a request to a method of the API, for the `execute-api` service and the
 * API's own Region, and serve it.
 */
async function signedGet(
  simAws: SimAws,
  restApi: SimRestApi,
  path: string,
  credentials: { accessKeyId: string; secretAccessKey: string },
): Promise<Response> {
  const signed = await signAwsRequest({
    url: new SimAwsLocalUrl({
      input: `${restApi.invokeUrl("prod")}${path}`,
    }).toString(),
    credentials,
    service: "execute-api",
    region: restApi.accountRegionScope.regionName,
  });

  return await new SimAwsHttp({ simAws }).handleRequest(signed.request);
}

async function iamRestApi(simAws: SimAws): Promise<SimRestApi> {
  return await simRestApiLambdaProxyFactory.make(
    {
      iamAuthorization: true,
      resourcePaths: ["/orders/{orderId}"],
      handler: reportContext,
    },
    simAws,
  );
}

describe("Calling an AWS_IAM sim REST API method with a signed request", () => {
  it("admits a signed caller the API's Account allows", async () => {
    // Given an AWS_IAM method and a User allowed to invoke it
    const simAws = new SimAws();
    const restApi = await iamRestApi(simAws);
    const credentials = await signingUser(
      simAws,
      `arn:aws:execute-api:us-east-1:${accountId}:${restApi.apiId}` +
        `/prod/GET/orders/*`,
    );

    // When they sign a request to the method and it is served
    const response = await signedGet(
      simAws,
      restApi,
      "/orders/42",
      credentials,
    );
    const context = (await response.json()) as SimPayload1RequestContext;

    // Then the signature identified them, and the handler was told who called
    assertIdentical(response.status, 200);
    assertIdentical(response.headers.get(simAwsAuthHeaderName), "sigv4");
    assertIdentical(
      context.identity.userArn,
      `arn:aws:iam::${accountId}:user/Reporter`,
    );
  });

  it("refuses a signed caller with no matching Allow", async () => {
    // Given an AWS_IAM method and a User allowed another API entirely
    const simAws = new SimAws();
    const restApi = await iamRestApi(simAws);
    const credentials = await signingUser(
      simAws,
      `arn:aws:execute-api:us-east-1:${accountId}:another01/*`,
    );

    // When they sign a request to the method and it is served
    const response = await signedGet(
      simAws,
      restApi,
      "/orders/42",
      credentials,
    );

    // Then a valid signature is authentication rather than authorization, and
    // the method stays closed to them
    assertIdentical(response.status, 403);
  });
});
