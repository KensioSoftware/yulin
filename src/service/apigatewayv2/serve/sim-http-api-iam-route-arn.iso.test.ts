import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import { assertResponseStatus, describeResponse } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simAwsCallerHeaderName } from "../../iam/request/sim-aws-caller-header.js";
import { simIamPolicyDocumentFactory } from "../../iam/policy/sim-iam-policy-document.factory.js";
import { simHttpApiLambdaProxyFactory } from "../api/sim-http-api-lambda-proxy.factory.js";
import type { SimHttpApi } from "../api/sim-http-api.js";

const accountId = "888888888888";
const reporterArn = `arn:aws:iam::${accountId}:role/Reporter`;

interface IamRouteInput {
  /** The route keys the API serves. */
  readonly routeKeys?: readonly string[];
  /** The stages the API serves from. */
  readonly stageNames?: readonly string[];
}

/**
 * An API whose routes are IAM-authorized, and a Role in its Account with no
 * policies yet.
 */
async function iamRoute(
  simAws: SimAws,
  input: IamRouteInput = {},
): Promise<SimHttpApi> {
  const api = await simHttpApiLambdaProxyFactory.make(
    {
      iamAuthorization: true,
      routeKeys: input.routeKeys ?? ["GET /orders/{orderId}"],
      ...(input.stageNames !== undefined && { stageNames: input.stageNames }),
      handler: (): string => "one order",
    },
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

  return api;
}

/**
 * Allow the Role one `execute-api` resource, named by the part of the ARN
 * after the API id.
 */
async function allowResource(
  simAws: SimAws,
  api: SimHttpApi,
  suffix: string,
): Promise<void> {
  const { accountId: apiAccountId, regionName } = api.accountRegionScope;

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "Reporter",
      PolicyName: `Invoke${suffix.replaceAll(/\W/g, "")}`,
      PolicyDocument: simIamPolicyDocumentFactory.make({
        Statement: {
          Action: "execute-api:Invoke",
          Resource:
            `arn:aws:execute-api:${regionName}:${apiAccountId}:` +
            `${api.apiId}/${suffix}`,
        },
      }),
    }),
  );
}

function callAs(
  simAws: SimAws,
  api: SimHttpApi,
  path: string,
  method = "GET",
): Promise<Response> {
  return new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({ input: `${api.apiEndpoint}${path}` }).toString(),
    { method, headers: { [simAwsCallerHeaderName]: reporterArn } },
  );
}

describe("The execute-api ARN an AWS_IAM route is authorized against", () => {
  it("is matched by a policy naming the API and nothing else", async () => {
    // Given a Role allowed everything under the API
    const simAws = new SimAws();
    const api = await iamRoute(simAws);
    await allowResource(simAws, api, "*");

    // When it calls a route
    const response = await callAs(simAws, api, "/orders/42");

    // Then the wildcard covers the stage, the method and the path
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("names the default stage as $default", async () => {
    // Given a Role allowed everything on the $default stage
    const simAws = new SimAws();
    const api = await iamRoute(simAws);
    await allowResource(simAws, api, "$default/*");

    // When it calls a route served from that stage
    const response = await callAs(simAws, api, "/orders/42");

    // Then the stage segment is the literal `$default`, not an empty segment
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("names the request's own method and path", async () => {
    // Given a Role allowed one method under one path, on any stage
    const simAws = new SimAws();
    const api = await iamRoute(simAws);
    await allowResource(simAws, api, "*/GET/orders/*");

    // When it calls a route matching that
    const response = await callAs(simAws, api, "/orders/42");

    // Then the ARN carries the concrete method and the concrete path, so a
    // policy written the way a human writes one matches
    assertResponseStatus(response, 200, await describeResponse(response));
  });

  it("is not matched by a policy naming another stage", async () => {
    // Given an API with two stages, and a Role allowed one of them
    const simAws = new SimAws();
    const api = await iamRoute(simAws, {
      routeKeys: ["GET /orders"],
      stageNames: ["dev", "prod"],
    });
    await allowResource(simAws, api, "dev/*");

    // When each stage serves the same route
    const development = await callAs(simAws, api, "/dev/orders");
    const production = await callAs(simAws, api, "/prod/orders");

    // Then only the named stage is allowed, and the path in the ARN is the one
    // left after the stage segment was taken off
    assertResponseStatus(development, 200, await describeResponse(development));
    assertResponseStatus(production, 403, await describeResponse(production));
  });

  it("is not matched by a policy naming a lowercase method", async () => {
    // Given a Role allowed the method in lower case
    const simAws = new SimAws();
    const api = await iamRoute(simAws);
    await allowResource(simAws, api, "$default/get/orders/*");

    // When it calls the route
    const response = await callAs(simAws, api, "/orders/42");

    // Then it is refused: IAM resource matching is case-sensitive, and API
    // Gateway puts an upper-case verb in the ARN
    assertResponseStatus(response, 403, await describeResponse(response));
  });

  it("takes the method from the request rather than from an ANY route", async () => {
    // Given an ANY route, and a Role allowed only POST
    const simAws = new SimAws();
    const api = await iamRoute(simAws, { routeKeys: ["ANY /orders"] });
    await allowResource(simAws, api, "$default/POST/orders");

    // When each method reaches that one route
    const posted = await callAs(simAws, api, "/orders", "POST");
    const fetched = await callAs(simAws, api, "/orders");

    // Then the ARN names what the client asked for, not the route key's `ANY`
    assertResponseStatus(posted, 200, await describeResponse(posted));
    assertResponseStatus(fetched, 403, await describeResponse(fetched));
  });

  it("names a root request with an empty path", async () => {
    // Given a Role allowed the API root and nothing under it
    const simAws = new SimAws();
    const api = await iamRoute(simAws, { routeKeys: ["$default"] });
    await allowResource(simAws, api, "$default/GET/");

    // When the root is called, and then a path under it
    const root = await callAs(simAws, api, "/");
    const nested = await callAs(simAws, api, "/orders");

    // Then the ARN of a root request ends with the method and an empty path,
    // which a policy has to name exactly
    assertResponseStatus(root, 200, await describeResponse(root));
    assertResponseStatus(nested, 403, await describeResponse(nested));
  });
});
