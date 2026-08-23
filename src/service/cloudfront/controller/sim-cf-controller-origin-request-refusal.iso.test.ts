import {
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import type { DistributionConfig } from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../test/cloudfront/edge-function-fixture.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

describe("Simulated CloudFront origin-request Lambda@Edge refusals", () => {
  /**
   * A site DistributionConfig whose default Behavior runs this function at the
   * origin request, with the rest of the Behavior left as the fixture has it.
   */
  function originRequestConfig(
    bucketName: string,
    versionArn: string,
  ): DistributionConfig {
    return simCfSiteDistributionConfig(bucketName, {
      DefaultCacheBehavior: {
        TargetOriginId: "site-origin",
        ViewerProtocolPolicy: "allow-all",
        LambdaFunctionAssociations: {
          Quantity: 1,
          Items: [
            { EventType: "origin-request", LambdaFunctionARN: versionArn },
          ],
        },
      },
    });
  }

  it("answers with a 502 when a function moved an S3 Origin to another Bucket", async () => {
    // Given a handler pointing the S3 Origin at a Bucket the Distribution was
    // never written with.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "moved-origin-site", {
      "index.html": "<h1>Home</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "move-bucket",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;
        assertNonNullable(request.origin.s3, "the Origin is an S3 one");
        request.origin.s3.domainName = "somewhere-else.s3.amazonaws.com";

        return request;
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      originRequestConfig("moved-origin-site", versionArn),
    );

    // When a request arrives.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the viewer gets the 502 a failed edge function gets, saying what
    // this simulation could not do.
    assertResponseStatus(response, 502);
    assertStringIncludes(await response.text(), "moving one is not simulated");
  });

  it("answers with a 502 when a function turned an S3 Origin into a custom Origin", async () => {
    // Given a handler handing back the other kind of Origin.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "swapped-origin-site", {
      "index.html": "<h1>Home</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "swap-origin-kind",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;

        request.origin = {
          custom: {
            customHeaders: {},
            domainName: "api.example.test",
            keepaliveTimeout: 5,
            path: "",
            port: 443,
            protocol: "https",
            readTimeout: 30,
            sslProtocols: ["TLSv1.2"],
          },
        };

        return request;
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      originRequestConfig("swapped-origin-site", versionArn),
    );

    // When a request arrives.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the viewer gets a 502 naming the switch as the part that is not
    // simulated.
    assertResponseStatus(response, 502);
    assertStringIncludes(
      await response.text(),
      "Switching an Origin between the two kinds is not simulated",
    );
  });
});
