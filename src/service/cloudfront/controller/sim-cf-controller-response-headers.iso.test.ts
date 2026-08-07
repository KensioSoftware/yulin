import { assertIdentical, assertNonNullable } from "@kensio/smartass";
import { CreateFunctionCommand } from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import { SimCloudFrontResponseHeader } from "../response-headers-policy/sim-cf-response-header.js";
import { SimCloudFrontResponseHeadersPolicy } from "../response-headers-policy/sim-cf-response-headers-policy.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

describe("Simulated CloudFront response headers policy in the request pipeline", () => {
  it("lets a viewer-response CFF see the policy's headers in its event", async () => {
    // Given a Distribution serving a page, with a policy setting a cache
    // directive the Origin says nothing about.
    const simAws = new SimAws();

    await simCfSiteBucket(simAws, "policy-order-bucket", {
      "index.html": "<h1>Home</h1>",
    });

    const policy = new SimCloudFrontResponseHeadersPolicy({
      name: "CacheHeaders",
      customHeaders: [
        new SimCloudFrontResponseHeader({
          name: "Cache-Control",
          value: "public, max-age=60",
          override: true,
        }),
      ],
    });

    simAws.cloudFront().addResponseHeadersPolicy(policy);

    // And a viewer-response function copying whatever cache directive it is
    // given into a header of its own.
    const cff = await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "cache-control-echo",
        FunctionConfig: {
          Comment: "Echoes the cache directive it was given",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(
          (event: CloudFrontFunction.ViewerResponseEvent) => {
            event.response.headers["x-seen-cache-control"] = {
              value: event.response.headers["cache-control"]?.value ?? "none",
            };

            return event.response;
          },
        ),
      }),
    );

    assertNonNullable(cff.FunctionMetadata.FunctionARN);

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("policy-order-bucket", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          ResponseHeadersPolicyId: policy.id,
          FunctionAssociations: {
            Quantity: 1,
            Items: [
              {
                EventType: "viewer-response",
                FunctionARN: cff.FunctionMetadata.FunctionARN,
              },
            ],
          },
        },
      }),
    );

    // When the page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/index.html");

    // Then the function saw the policy's header, because CloudFront applies a
    // policy before the viewer-response event rather than after it.
    assertIdentical(
      home.headers.get("x-seen-cache-control"),
      "public, max-age=60",
    );
    assertIdentical(home.headers.get("cache-control"), "public, max-age=60");
  });

  it("lets a viewer-response CFF change what the policy set", async () => {
    // Given the same arrangement, with a function that replaces the header.
    const simAws = new SimAws();

    await simCfSiteBucket(simAws, "policy-override-bucket", {
      "index.html": "<h1>Home</h1>",
    });

    const policy = new SimCloudFrontResponseHeadersPolicy({
      name: "CacheHeaders",
      customHeaders: [
        new SimCloudFrontResponseHeader({
          name: "Cache-Control",
          value: "public, max-age=60",
          override: true,
        }),
      ],
    });

    simAws.cloudFront().addResponseHeadersPolicy(policy);

    const cff = await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "cache-control-replace",
        FunctionConfig: {
          Comment: "Replaces the cache directive",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(
          (event: CloudFrontFunction.ViewerResponseEvent) => {
            event.response.headers["cache-control"] = { value: "no-store" };

            return event.response;
          },
        ),
      }),
    );

    assertNonNullable(cff.FunctionMetadata.FunctionARN);

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("policy-override-bucket", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          ResponseHeadersPolicyId: policy.id,
          FunctionAssociations: {
            Quantity: 1,
            Items: [
              {
                EventType: "viewer-response",
                FunctionARN: cff.FunctionMetadata.FunctionARN,
              },
            ],
          },
        },
      }),
    );

    // When the page is requested.
    const home = await simCfSiteRequest(simAws, distributionId, "/index.html");

    // Then the function's value is what the viewer gets, being the last thing
    // to touch the response.
    assertIdentical(home.headers.get("cache-control"), "no-store");
  });
});
