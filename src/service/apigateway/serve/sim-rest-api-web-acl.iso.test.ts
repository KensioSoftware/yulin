import {
  AssociateWebACLCommand,
  CreateWebACLCommand,
} from "@aws-sdk/client-wafv2";
import {
  assertFalse,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload1Event } from "../../../serve/payload-1/sim-payload-1-event.type.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simRestApiLambdaProxyFactory } from "../api/sim-rest-api-lambda-proxy.factory.js";
import type { SimRestApi } from "../api/sim-rest-api.js";

/**
 * A web ACL blocking whatever asks for an admin path, in front of one stage.
 *
 * Every test here is about what the stage does with a request once a web ACL
 * is in front of it, and the ACL itself is the same one each time: one rule,
 * blocking, over a default action of allow.
 */
async function protectStage(
  simAws: SimAws,
  restApi: SimRestApi,
  stageName = "prod",
): Promise<void> {
  const waf = simAws.wafV2();
  const created = await waf.createWebAcl(
    new CreateWebACLCommand({
      Name: "api-acl",
      Scope: "REGIONAL",
      DefaultAction: { Allow: {} },
      VisibilityConfig: {
        SampledRequestsEnabled: false,
        CloudWatchMetricsEnabled: false,
        MetricName: "api",
      },
      Rules: [
        {
          Name: "block-admin",
          Priority: 0,
          Action: { Block: {} },
          Statement: {
            ByteMatchStatement: {
              FieldToMatch: { UriPath: {} },
              PositionalConstraint: "CONTAINS",
              SearchString: Buffer.from("/admin"),
              TextTransformations: [{ Priority: 0, Type: "NONE" }],
            },
          },
          VisibilityConfig: {
            SampledRequestsEnabled: false,
            CloudWatchMetricsEnabled: false,
            MetricName: "block-admin",
          },
        },
      ],
    }),
  );

  await waf.associateWebAcl(
    new AssociateWebACLCommand({
      WebACLArn: created.Summary?.ARN,
      ResourceArn: restApi.stageArn(stageName),
    }),
  );
}

function localUrl(restApi: SimRestApi, path: string, stage = "prod"): string {
  return new SimAwsLocalUrl({
    input: `${restApi.invokeUrl(stage)}${path}`,
  }).toString();
}

describe("A web ACL in front of a sim REST API stage", () => {
  it("blocks a request before the integration is invoked", async () => {
    // Given a stage a web ACL protects, in front of a counting handler
    const simAws = new SimAws();
    let invocations = 0;
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (): unknown => {
          invocations += 1;
          return { statusCode: 200, body: "ok" };
        },
      },
      simAws,
    );
    await protectStage(simAws, restApi);

    // When a request the web ACL blocks is made
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/admin/users"),
    );

    // Then WAF answered it and the integration never ran
    assertIdentical(response.status, 403);
    assertStringIncludes(await response.text(), "Request blocked by AWS WAF");
    assertIdentical(invocations, 0);
  });

  it("serves a request the web ACL allows as it always did", async () => {
    // Given the same protected stage
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: (): unknown => ({ statusCode: 200, body: "orders" }) },
      simAws,
    );
    await protectStage(simAws, restApi);

    // When a request no rule claims is made
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
    );

    // Then the integration answered it
    assertIdentical(response.status, 200);
    assertIdentical(await response.text(), "orders");
  });

  it("blocks before a Lambda authorizer is invoked", async () => {
    // Given a protected stage whose methods are behind a TOKEN authorizer
    const simAws = new SimAws();
    let authorizations = 0;
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (): unknown => ({ statusCode: 200, body: "ok" }),
        authorizerHandler: (): unknown => {
          authorizations += 1;
          return { principalId: "someone" };
        },
      },
      simAws,
    );
    await protectStage(simAws, restApi);

    // When a blocked request arrives carrying a token the authorizer would
    // have been asked about
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/admin/users"),
      { headers: { authorization: "let-me-in" } },
    );

    // Then the web ACL decided it and the authorizer was never invoked
    assertIdentical(response.status, 403);
    assertStringIncludes(await response.text(), "Request blocked by AWS WAF");
    assertIdentical(authorizations, 0);
  });

  it("blocks before an AWS_IAM method's own check", async () => {
    // Given a protected stage whose methods are behind IAM
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (): unknown => ({ statusCode: 200, body: "ok" }),
        iamAuthorization: true,
      },
      simAws,
    );
    await protectStage(simAws, restApi);

    // When an unsigned request the web ACL blocks is made
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/admin/users"),
    );

    // Then it is WAF's answer rather than the one IAM would have given
    assertIdentical(response.status, 403);
    assertStringIncludes(await response.text(), "Request blocked by AWS WAF");
  });

  it("inspects the body a request carried and leaves it for the integration", async () => {
    // Given a stage protected by a web ACL with no rule about the body
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload1Event): unknown => ({
          statusCode: 200,
          body: event.body ?? "",
        }),
      },
      simAws,
    );
    await protectStage(simAws, restApi);

    // When a request with a body is allowed through
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/orders"),
      { method: "POST", body: "one large order" },
    );

    // Then the integration still received the body WAF read
    assertIdentical(await response.text(), "one large order");
  });

  it("adds the headers a rule asked to insert to what is forwarded", async () => {
    // Given a stage whose web ACL allows admin paths with a header added
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      {
        handler: (event: SimPayload1Event): unknown => ({
          statusCode: 200,
          body: event.headers?.["x-amzn-waf-checked"] ?? "none",
        }),
      },
      simAws,
    );
    const waf = simAws.wafV2();
    const created = await waf.createWebAcl(
      new CreateWebACLCommand({
        Name: "api-acl",
        Scope: "REGIONAL",
        DefaultAction: { Allow: {} },
        VisibilityConfig: {
          SampledRequestsEnabled: false,
          CloudWatchMetricsEnabled: false,
          MetricName: "api",
        },
        Rules: [
          {
            Name: "note-admin",
            Priority: 0,
            Action: {
              Allow: {
                CustomRequestHandling: {
                  InsertHeaders: [{ Name: "checked", Value: "yes" }],
                },
              },
            },
            Statement: {
              ByteMatchStatement: {
                FieldToMatch: { UriPath: {} },
                PositionalConstraint: "CONTAINS",
                SearchString: Buffer.from("/admin"),
                TextTransformations: [{ Priority: 0, Type: "NONE" }],
              },
            },
            VisibilityConfig: {
              SampledRequestsEnabled: false,
              CloudWatchMetricsEnabled: false,
              MetricName: "note-admin",
            },
          },
        ],
      }),
    );
    await waf.associateWebAcl(
      new AssociateWebACLCommand({
        WebACLArn: created.Summary?.ARN,
        ResourceArn: restApi.stageArn("prod"),
      }),
    );

    // When the rule allows a request and asks for its header
    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/admin/users"),
    );

    // Then the integration saw the header WAF inserted
    assertIdentical(await response.text(), "yes");
  });

  it("stops protecting a stage that is deleted", async () => {
    // Given a protected stage
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: (): unknown => ({ statusCode: 200, body: "ok" }) },
      simAws,
    );
    await protectStage(simAws, restApi);

    // When the stage is deleted and deployed again under the same name
    await simAws
      .apiGateway()
      .deleteStage({ input: { restApiId: restApi.apiId, stageName: "prod" } });
    await simAws.apiGateway().createDeployment({
      input: { restApiId: restApi.apiId, stageName: "prod" },
    });

    const response = await new SimAwsHttp({ simAws }).fetch(
      localUrl(restApi, "/admin/users"),
    );

    // Then nothing is in front of the new stage
    assertIdentical(response.status, 200);
  });

  it("stops protecting the stages of an API that is deleted", async () => {
    // Given a protected stage
    const simAws = new SimAws();
    const restApi = await simRestApiLambdaProxyFactory.make(
      { handler: (): unknown => ({ statusCode: 200, body: "ok" }) },
      simAws,
    );
    await protectStage(simAws, restApi);
    const stageArn = restApi.stageArn("prod");

    // When the whole API is deleted
    await simAws
      .apiGateway()
      .deleteRestApi({ input: { restApiId: restApi.apiId } });

    // Then the web ACL is no longer in front of the stage it had
    assertFalse(simAws.wafV2().protection().protects(stageArn));
  });
});
