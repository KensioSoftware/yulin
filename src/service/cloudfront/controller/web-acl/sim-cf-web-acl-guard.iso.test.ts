import {
  CreateDistributionCommand,
  CreateFunctionCommand,
  type DistributionConfig,
} from "@aws-sdk/client-cloudfront";
import {
  CreateLogGroupCommand,
  FilterLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { DeleteWebACLCommand } from "@aws-sdk/client-wafv2";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simWafCreateWebAclFactory } from "../../../wafv2/command/web-acl/sim-waf-create-web-acl.factory.js";
import { simWafCloudFrontRegion } from "../../../wafv2/scope/sim-waf-scope.js";
import { createSimWafWebAcl } from "../../../wafv2/sim-wafv2.fixture.js";
import type { SimWafActionInput } from "../../../wafv2/web-acl/sim-waf-action.type.js";
import { simWafRuleFactory } from "../../../wafv2/web-acl/sim-waf-rule.factory.js";
import { makeCffFunctionCodeInput } from "../../cff/function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../../typings/cloudfront-functions.namespace.js";
import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";

/** The log group the Origin function writes what it served to. */
const logGroupName = "/aws/lambda/site";

/**
 * A simulation whose Origin is an HTTP API that records what it was asked for.
 *
 * A request that never reaches the Origin is the whole point of a web ACL, and
 * the only way to see that from outside is to have the Origin say when it was
 * reached. The log group is created up front so that a request that got
 * nowhere near it leaves an empty group rather than no group at all.
 */
async function simAwsWithRecordingOrigin(): Promise<{
  readonly simAws: SimAws;
  readonly originDomainName: string;
}> {
  const simAws = new SimAws();
  const api = await simHttpApiLambdaProxyFactory.make(
    {
      functionName: "site",
      handler: (event): unknown => {
        // The Origin says what it served through its own log group, which is
        // the only way a test can see that a blocked request never got here.
        // oxlint-disable-next-line no-console -- the record under assertion
        console.log(`served ${event.rawPath} ${event.body ?? ""}`.trimEnd());

        return { statusCode: 200, body: "origin page" };
      },
    },
    simAws,
  );

  await simAws
    .logs()
    .createLogGroup(new CreateLogGroupCommand({ logGroupName }));

  return { simAws, originDomainName: new URL(api.apiEndpoint).hostname };
}

/**
 * What the Origin was asked for, in the order it served the requests.
 */
async function servedByOrigin(simAws: SimAws): Promise<readonly string[]> {
  await simAws.backgroundTasksComplete();
  const found = await simAws
    .logs()
    .filterLogEvents(new FilterLogEventsCommand({ logGroupName }));

  return found.events?.map((event) => event.message) ?? [];
}

/**
 * A CLOUDFRONT scope web ACL whose one rule claims everything under `/admin`
 * and takes the action given.
 */
async function adminWebAclArn(
  simAws: SimAws,
  action: SimWafActionInput,
): Promise<string> {
  const created = await createSimWafWebAcl(
    simAws.region(simWafCloudFrontRegion).account().wafV2(),
    simWafCreateWebAclFactory.make({
      Scope: "CLOUDFRONT",
      Rules: [
        {
          ...simWafRuleFactory.make({ Name: "admin" }),
          Action: action,
          Statement: {
            ByteMatchStatement: {
              SearchString: "/admin",
              PositionalConstraint: "STARTS_WITH",
              FieldToMatch: { UriPath: {} },
              TextTransformations: [{ Priority: 0, Type: "NONE" }],
            },
          },
        },
      ],
    }),
  );

  return created.ARN;
}

/**
 * A CloudFront Function that answers every request itself, reporting the
 * header WAF inserts for a `reviewed-by` custom request handling header.
 *
 * It stands in for everything downstream of the web ACL: a request it never
 * saw is one that never got past WAF, and one it did see carries whatever WAF
 * added on the way through.
 */
async function reportingFunctionArn(simAws: SimAws): Promise<string> {
  const created = await simAws.cloudFront().createFunction(
    new CreateFunctionCommand({
      Name: "report-web-acl-handling",
      FunctionConfig: {
        Comment: "Answers with the reviewed-by header it was given",
        Runtime: "cloudfront-js-2.0",
      },
      FunctionCode: makeCffFunctionCodeInput(
        (event: CloudFrontFunction.ViewerRequestEvent) => ({
          statusCode: 204,
          headers: {
            "x-reviewed-by": {
              value:
                event.request.headers["x-amzn-waf-reviewed-by"]?.value ??
                "nobody",
            },
          },
        }),
      ),
    }),
  );

  return created.FunctionMetadata.FunctionARN;
}

/**
 * A Distribution serving the recording Origin from behind a web ACL, with the
 * viewer-request Function attached when one is named.
 */
async function guardedDistributionId(
  simAws: SimAws,
  properties: {
    readonly originDomainName: string;
    readonly webAclArn: string;
    readonly functionArn?: string | undefined;
  },
): Promise<string> {
  const { functionArn } = properties;
  const distributionConfig: DistributionConfig = {
    CallerReference: "web-acl-guarded",
    Comment: "Guarded by a web ACL",
    Enabled: true,
    WebACLId: properties.webAclArn,
    Origins: {
      Quantity: 1,
      Items: [
        {
          Id: "api-origin",
          DomainName: properties.originDomainName,
          CustomOriginConfig: {
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginProtocolPolicy: "https-only",
          },
        },
      ],
    },
    DefaultCacheBehavior: {
      TargetOriginId: "api-origin",
      ViewerProtocolPolicy: "allow-all",
      AllowedMethods: {
        Quantity: 3,
        Items: ["GET", "HEAD", "POST"],
        CachedMethods: { Quantity: 2, Items: ["GET", "HEAD"] },
      },
      FunctionAssociations:
        functionArn === undefined
          ? undefined
          : {
              Quantity: 1,
              Items: [
                { EventType: "viewer-request", FunctionARN: functionArn },
              ],
            },
    },
  };

  const creation = await simAws
    .cloudFront()
    .createDistribution(
      new CreateDistributionCommand({ DistributionConfig: distributionConfig }),
    );

  assertNonNullable(creation.Distribution?.Id);

  return creation.Distribution.Id;
}

describe("A request to a sim CloudFront Distribution behind a web ACL", () => {
  it("gets 403 and never reaches the Origin when the web ACL blocks it", async () => {
    // Given a Distribution behind a web ACL that blocks everything under
    // /admin.
    const { simAws, originDomainName } = await simAwsWithRecordingOrigin();
    const distributionId = await guardedDistributionId(simAws, {
      originDomainName,
      webAclArn: await adminWebAclArn(simAws, { Block: {} }),
    });

    // When a viewer asks for a page under it.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/admin/users",
    );

    // Then the edge answered it with WAF's own 403 page, and the Origin was
    // never asked for anything.
    assertResponseStatus(response, 403);
    assertStringIncludes(await response.text(), "Request blocked by AWS WAF");
    assertArrayLength(await servedByOrigin(simAws), 0);
  });

  it("reaches the Origin unchanged when the web ACL allows it", async () => {
    // Given the same Distribution behind the same web ACL.
    const { simAws, originDomainName } = await simAwsWithRecordingOrigin();
    const distributionId = await guardedDistributionId(simAws, {
      originDomainName,
      webAclArn: await adminWebAclArn(simAws, { Block: {} }),
    });

    // When a viewer asks for a page no rule claims.
    const response = await simCfSiteRequest(simAws, distributionId, "/orders");

    // Then the Origin served it, as it would with no web ACL in front at all.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "origin page");
    assertArrayEquals(await servedByOrigin(simAws), ["served /orders"]);
  });

  it("never invokes a viewer-request Function for a blocked request", async () => {
    // Given a Distribution behind a blocking web ACL whose viewer-request
    // Function answers every request it sees.
    const { simAws, originDomainName } = await simAwsWithRecordingOrigin();
    const distributionId = await guardedDistributionId(simAws, {
      originDomainName,
      webAclArn: await adminWebAclArn(simAws, { Block: {} }),
      functionArn: await reportingFunctionArn(simAws),
    });

    // When a viewer asks for a page the web ACL blocks.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/admin/users",
    );

    // Then WAF answered it and the Function never ran, because CloudFront asks
    // WAF ahead of every edge function.
    assertResponseStatus(response, 403);
    assertIdentical(response.headers.get("x-reviewed-by"), null);
  });

  it("carries the headers an allowing rule inserted past the web ACL", async () => {
    // Given a Distribution whose web ACL allows /admin with a header of its
    // own added to what it lets through.
    const { simAws, originDomainName } = await simAwsWithRecordingOrigin();
    const distributionId = await guardedDistributionId(simAws, {
      originDomainName,
      webAclArn: await adminWebAclArn(simAws, {
        Allow: {
          CustomRequestHandling: {
            InsertHeaders: [{ Name: "reviewed-by", Value: "waf" }],
          },
        },
      }),
      functionArn: await reportingFunctionArn(simAws),
    });

    // When a viewer asks for a page the rule claims.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/admin/users",
    );

    // Then what runs after the web ACL sees the header it inserted.
    assertResponseStatus(response, 204);
    assertIdentical(response.headers.get("x-reviewed-by"), "waf");
  });

  it("decides on the request body, and forwards it to the Origin all the same", async () => {
    // Given a Distribution behind a web ACL whose rule reads the request body.
    const { simAws, originDomainName } = await simAwsWithRecordingOrigin();
    const created = await createSimWafWebAcl(
      simAws.region(simWafCloudFrontRegion).account().wafV2(),
      simWafCreateWebAclFactory.make({
        Scope: "CLOUDFRONT",
        Rules: [
          {
            ...simWafRuleFactory.make({ Name: "no-secrets" }),
            Action: { Block: {} },
            Statement: {
              ByteMatchStatement: {
                SearchString: "secret",
                PositionalConstraint: "CONTAINS",
                FieldToMatch: { Body: {} },
                TextTransformations: [{ Priority: 0, Type: "NONE" }],
              },
            },
          },
        ],
      }),
    );
    const distributionId = await guardedDistributionId(simAws, {
      originDomainName,
      webAclArn: created.ARN,
    });

    // When one POST carries what the rule claims and another does not.
    const blocked = await simCfSiteRequest(simAws, distributionId, "/orders", {
      method: "POST",
      body: "a secret",
    });
    const allowed = await simCfSiteRequest(simAws, distributionId, "/orders", {
      method: "POST",
      body: "an order",
    });

    // Then the first is blocked at the edge, and the second reaches the Origin
    // with the body it was sent with: reading it for WAF does not consume it.
    assertResponseStatus(blocked, 403);
    assertResponseStatus(allowed, 200);
    assertArrayEquals(await servedByOrigin(simAws), [
      "served /orders an order",
    ]);
  });

  it("refuses to serve once the web ACL it names has been deleted", async () => {
    // Given a Distribution behind a web ACL.
    const { simAws, originDomainName } = await simAwsWithRecordingOrigin();
    const waf = simAws.region(simWafCloudFrontRegion).account().wafV2();
    const webAclArn = await adminWebAclArn(simAws, { Block: {} });
    const distributionId = await guardedDistributionId(simAws, {
      originDomainName,
      webAclArn,
    });

    // When the web ACL is deleted out from under it, which real WAF refuses
    // while a Distribution is still in front of it.
    const webAcl = waf.findWebAclByArn(webAclArn);
    assertNonNullable(webAcl);
    await waf.deleteWebAcl(
      new DeleteWebACLCommand({
        Name: webAcl.name,
        Scope: "CLOUDFRONT",
        Id: webAcl.id,
        LockToken: webAcl.lockToken,
      }),
    );

    // Then the Distribution says so, rather than quietly serving the requests
    // the web ACL would have decided.
    const response = await simCfSiteRequest(simAws, distributionId, "/orders");

    assertResponseStatus(response, 400);
    assertStringIncludes(await response.text(), webAclArn);
    assertArrayLength(await servedByOrigin(simAws), 0);
  });
});
