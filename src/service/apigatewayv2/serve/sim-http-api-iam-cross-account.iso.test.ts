import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { describe, it } from "vitest";

import { signAwsRequest } from "../../../../test/sigv4/sign-aws-request.js";
import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

const apiAccountId = "888888888888";
const callerAccountId = "222222222222";
const callerRoleArn = `arn:aws:iam::${callerAccountId}:role/Caller`;

/**
 * Create a Role with a trust policy naming one principal, and an identity
 * policy allowing one action on everything.
 */
async function roleAllowing(
  simAws: SimAws,
  input: {
    readonly accountId: string;
    readonly roleName: string;
    readonly trusts: string;
    readonly action: string;
  },
): Promise<void> {
  const iam = simAws.account(input.accountId).iam();
  await iam.createRole(
    new CreateRoleCommand({
      RoleName: input.roleName,
      AssumeRolePolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Principal: { AWS: input.trusts },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );
  await iam.putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: input.roleName,
      PolicyName: `${input.roleName}Policy`,
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: { Action: input.action, Resource: "*" },
      }),
    }),
  );
}

async function iamApi(simAws: SimAws): Promise<SimHttpApi> {
  return await simHttpApiLambdaProxyFactory.make(
    {
      iamAuthorization: true,
      routeKeys: ["GET /orders"],
      handler: (): string => "orders",
    },
    simAws,
  );
}

function url(api: SimHttpApi): string {
  return new SimAwsLocalUrl({
    input: `${api.apiEndpoint}/orders`,
  }).toString();
}

describe("Calling an AWS_IAM sim HTTP API route from another Account", () => {
  it("refuses a caller from another Account its own Account allows", async () => {
    // Given an AWS_IAM route, and a Role in another Account allowed to invoke
    // any execute-api resource
    const simAws = new SimAws();
    const api = await iamApi(simAws);
    await roleAllowing(simAws, {
      accountId: callerAccountId,
      roleName: "Caller",
      trusts: `arn:aws:iam::${callerAccountId}:root`,
      action: "execute-api:Invoke",
    });

    // When that Role calls the route
    const response = await new SimAwsHttp({ simAws }).fetch(url(api), {
      headers: { [simAwsCallerHeaderName]: callerRoleArn },
    });

    // Then it is refused: a cross-Account request needs an Allow from the
    // resource side too, and an HTTP API has nowhere to put one
    assertIdentical(response.status, 403);
  });

  it("admits the same caller once it assumes a Role in the API's Account", async () => {
    // Given an AWS_IAM route, and a Role in another Account allowed to assume
    // a Role in the API's Account
    const simAws = new SimAws();
    const api = await iamApi(simAws);
    await roleAllowing(simAws, {
      accountId: callerAccountId,
      roleName: "Caller",
      trusts: `arn:aws:iam::${callerAccountId}:root`,
      action: "sts:AssumeRole",
    });

    // And that Role in the API's Account, trusting the caller and allowed to
    // invoke the API
    await roleAllowing(simAws, {
      accountId: apiAccountId,
      roleName: "Reporter",
      trusts: callerRoleArn,
      action: "execute-api:Invoke",
    });

    // When the caller assumes it and signs with the session credentials
    const assumed = await simAws
      .account(callerAccountId)
      .sts()
      .assumeRole(
        new AssumeRoleCommand({
          RoleArn: `arn:aws:iam::${apiAccountId}:role/Reporter`,
          RoleSessionName: "reporting",
        }),
        { caller: { kind: "arn", arn: callerRoleArn } },
      );
    const credentials = assumed.Credentials;
    assertNonNullable(credentials);
    assertNonNullable(credentials.AccessKeyId);
    assertNonNullable(credentials.SecretAccessKey);
    assertNonNullable(credentials.SessionToken);

    const signed = await signAwsRequest({
      url: url(api),
      credentials: {
        accessKeyId: credentials.AccessKeyId,
        secretAccessKey: credentials.SecretAccessKey,
        sessionToken: credentials.SessionToken,
      },
      service: "execute-api",
      region: api.accountRegionScope.regionName,
    });
    const response = await new SimAwsHttp({ simAws }).handleRequest(
      signed.request,
    );

    // Then the request is now made by a principal of the API's own Account,
    // which is the way through on AWS as well
    assertIdentical(response.status, 200);
  });
});
