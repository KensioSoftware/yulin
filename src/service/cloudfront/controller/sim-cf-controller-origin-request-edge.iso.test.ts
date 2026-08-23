import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
} from "@kensio/smartass";
import {
  CreateFunctionCommand,
  type DistributionConfig,
} from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { makeCffFunctionCodeInput } from "../cff/function-code-input/cff-function-code-input.js";
import type { CloudFrontFunction } from "../typings/cloudfront-functions.namespace.js";
import type { LambdaAtEdge } from "../typings/lambda-at-edge.namespace.js";
import { makeEdgeFunctionVersionArn } from "../../../../test/cloudfront/edge-function-fixture.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteDistributionId,
  simCfSiteRequest,
} from "../../../../test/cloudfront/site-fixture.js";

describe("Simulated CloudFront origin-request Lambda@Edge", () => {
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

  it("tells the handler which Origin the fetch is about to read", async () => {
    // Given a site whose Origin the Behavior resolved before the function ran.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "origin-event-site", {});

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "echo-origin",
      handler: (
        event: LambdaAtEdge.OriginRequestEvent,
      ): LambdaAtEdge.Response => {
        const { request } = event.Records[0].cf;

        return {
          status: "200",
          body: JSON.stringify({
            origin: request.origin,
            host: request.headers["host"]?.[0]?.value,
            eventType: event.Records[0].cf.config.eventType,
          }),
        };
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      originRequestConfig("origin-event-site", versionArn),
    );

    // When a request arrives.
    const response = await simCfSiteRequest(simAws, distributionId, "/any");

    // Then the event carried the S3 Origin the Behavior targets, and the host
    // is the Origin's domain rather than the one the viewer used.
    const seen = (await response.json()) as {
      origin: LambdaAtEdge.Origin;
      host: string;
      eventType: string;
    };

    assertIdentical(seen.eventType, "origin-request");
    assertIdentical(seen.host, "origin-event-site.s3.amazonaws.com");
    assertNonNullable(seen.origin.s3, "the event carried an S3 Origin");
    assertIdentical(
      seen.origin.s3.domainName,
      "origin-event-site.s3.amazonaws.com",
    );
    assertIdentical(seen.origin.s3.authMethod, "none");
    assertIdentical(seen.origin.s3.region, "us-east-1");
  });

  it("reads the Bucket prefix a function rewrote the Origin path to", async () => {
    // Given a site holding two releases of the same page.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "release-site", {
      "v1/index.html": "<h1>Old</h1>",
      "v2/index.html": "<h1>New</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "pick-release",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;
        assertNonNullable(request.origin.s3, "the Origin is an S3 one");
        request.origin.s3.path = "/v2";

        return request;
      },
    });

    // And an Origin serving the older release.
    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("release-site", {
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "site-origin",
              DomainName: "release-site.s3.amazonaws.com",
              OriginPath: "/v1",
              S3OriginConfig: { OriginAccessIdentity: "" },
            },
          ],
        },
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
      }),
    );

    // When a request arrives.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the newer release is what the fetch read.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>New</h1>");
  });

  it("answers the viewer from a function that returned a response, without reading the Origin", async () => {
    // Given a site whose one object the function never lets the fetch reach.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "origin-short-circuit-site", {
      "index.html": "<h1>Never served</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "answer-at-origin",
      handler: (): LambdaAtEdge.Response => ({
        status: "200",
        statusDescription: "OK",
        headers: {
          "content-type": [{ key: "Content-Type", value: "text/html" }],
        },
        body: "<h1>From the edge</h1>",
      }),
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      originRequestConfig("origin-short-circuit-site", versionArn),
    );

    // When a request arrives for the object.
    const response = await simCfSiteRequest(
      simAws,
      distributionId,
      "/index.html",
    );

    // Then the handler's response is what the viewer gets, and the Bucket was
    // never read.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>From the edge</h1>");
  });

  it("keeps the Behavior's Origin where the handler built a request without one", async () => {
    // Given a handler that answers with a request object of its own, which
    // carries no Origin for the fetch to read.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "rebuilt-request-site", {
      "index.html": "<h1>Home</h1>",
    });

    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "rebuild-request",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;

        return {
          clientIp: request.clientIp,
          method: request.method,
          uri: "/index.html",
          querystring: request.querystring,
          headers: request.headers,
        };
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      originRequestConfig("rebuilt-request-site", versionArn),
    );

    // When a request arrives.
    const response = await simCfSiteRequest(simAws, distributionId, "/any");

    // Then the fetch went to the Origin the Behavior targets.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });

  it("runs a viewer-request CloudFront Function alongside an origin-request Lambda@Edge function", async () => {
    // Given a CloudFront Function rewriting the URI at the viewer.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "both-kinds-site", {
      "v2/index.html": "<h1>New</h1>",
    });

    const cff = await simAws.cloudFront().createFunction(
      new CreateFunctionCommand({
        Name: "rewrite-uri",
        FunctionConfig: {
          Comment: "Rewrite to the page",
          Runtime: "cloudfront-js-2.0",
        },
        FunctionCode: makeCffFunctionCodeInput(
          (event: CloudFrontFunction.ViewerRequestEvent) => {
            event.request.uri = "/index.html";

            return event.request;
          },
        ),
      }),
    );
    const functionArn = cff.FunctionMetadata.FunctionARN;

    // And a Lambda@Edge function picking the Origin prefix at the Origin.
    const versionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "pick-prefix",
      handler: (event: LambdaAtEdge.OriginRequestEvent) => {
        const { request } = event.Records[0].cf;
        assertNonNullable(request.origin.s3, "the Origin is an S3 one");
        request.origin.s3.path = "/v2";

        return request;
      },
    });

    const distributionId = await simCfSiteDistributionId(
      simAws,
      simCfSiteDistributionConfig("both-kinds-site", {
        DefaultCacheBehavior: {
          TargetOriginId: "site-origin",
          ViewerProtocolPolicy: "allow-all",
          FunctionAssociations: {
            Quantity: 1,
            Items: [{ EventType: "viewer-request", FunctionARN: functionArn }],
          },
          LambdaFunctionAssociations: {
            Quantity: 1,
            Items: [
              { EventType: "origin-request", LambdaFunctionARN: versionArn },
            ],
          },
        },
      }),
    );

    // When a request arrives for the site root.
    const response = await simCfSiteRequest(simAws, distributionId, "/");

    // Then both functions ran: the CloudFront Function named the page, and the
    // Lambda@Edge function named the prefix it was read from.
    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>New</h1>");
  });

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
