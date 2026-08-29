import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import {
  assertArrayEquals,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertUndefined,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAwsHttp } from "../../../../serve/http/sim-aws-http.js";
import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import type { SimPayload2Event } from "../../../../serve/payload-2/sim-payload-2-event.type.js";
import { simHttpApiLambdaProxyFactory } from "../../../apigatewayv2/api/sim-http-api-lambda-proxy.factory.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { simCfManagedCachePolicyIds } from "../../cache-policy/sim-cf-managed-cache-policies.js";
import { simCfManagedOriginRequestPolicyIds } from "../../origin-request-policy/sim-cf-managed-origin-request-policies.js";

/**
 * What the Origin read of the request the Distribution sent it.
 */
interface OriginRead {
  readonly query: string;
  readonly cookies: readonly string[];
  readonly headers: Record<string, string>;
}

/**
 * The policies a Behavior names, which are what decide the answer in every
 * case here.
 */
interface BehaviorPolicies {
  readonly CachePolicyId?: string;
  readonly OriginRequestPolicyId?: string;
}

/**
 * The viewer request every case sends: two query strings, two cookies, and
 * headers a policy might name one of.
 */
const viewerPath = "/things?page=2&start=10";

const viewerHeaders = {
  "accept-encoding": "deflate, gzip, br",
  cookie: "session=abc; theme=dark",
  origin: "https://viewer.example.com",
  referer: "https://viewer.example.com/index.html",
  "user-agent": "Mozilla/5.0",
  "x-request-id": "request-1",
};

/**
 * Send one viewer request through a Distribution whose Behavior names the
 * given policies, and report what the Origin behind it read.
 */
async function originReads(policies: BehaviorPolicies): Promise<OriginRead> {
  const simAws = new SimAws();
  const api = await simHttpApiLambdaProxyFactory.make(
    {
      handler: (event: SimPayload2Event): unknown => ({
        query: event.rawQueryString,
        cookies: event.cookies ?? [],
        headers: event.headers,
      }),
      routeKeys: ["GET /things"],
    },
    simAws,
  );

  const creation = await simAws.cloudFront().createDistribution(
    new CreateDistributionCommand({
      DistributionConfig: {
        CallerReference: "origin-request-forwarding",
        Comment: "Search CDN",
        Enabled: true,
        Origins: {
          Quantity: 1,
          Items: [
            {
              Id: "ApiOrigin",
              DomainName: new URL(api.apiEndpoint).hostname,
              CustomOriginConfig: {
                HTTPPort: 80,
                HTTPSPort: 443,
                OriginProtocolPolicy: "https-only",
              },
            },
          ],
        },
        DefaultCacheBehavior: {
          TargetOriginId: "ApiOrigin",
          ViewerProtocolPolicy: "allow-all",
          ...policies,
        },
      },
    }),
  );

  const distroHostname = creation.Distribution?.DomainName;
  assertNonNullable(distroHostname);

  const response = await new SimAwsHttp({ simAws }).fetch(
    new SimAwsLocalUrl({
      input: `https://${distroHostname}${viewerPath}`,
    }).toString(),
    { headers: viewerHeaders },
  );

  assertResponseStatus(response, 200, await describeResponse(response));

  return (await response.json()) as OriginRead;
}

describe("What a CloudFront custom Origin is sent", () => {
  it("sends none of the viewer's request where the Behavior names no policy", async () => {
    // Given a Behavior naming neither a cache policy nor an origin request
    // policy, which is a Distribution that was never told what its Origin
    // needs.
    const read = await originReads({});

    // Then the Origin is asked for the path alone, with no query string and no
    // cookie.
    assertIdentical(read.query, "");
    assertArrayEquals(read.cookies, []);

    // And none of the viewer's headers reach it either.
    assertUndefined(read.headers["x-request-id"]);
    assertUndefined(read.headers["referer"]);

    // And CloudFront states itself as the user agent, since the viewer's own
    // did not travel.
    assertIdentical(read.headers["user-agent"], "Amazon CloudFront");
  });

  it("sends the whole viewer request under AllViewer", async () => {
    // Given a Behavior on the managed policy that forwards everything.
    const read = await originReads({
      OriginRequestPolicyId: simCfManagedOriginRequestPolicyIds.allViewer,
    });

    // Then the query string, both cookies and the viewer's own headers travel.
    assertIdentical(read.query, "page=2&start=10");
    assertArrayEquals(read.cookies, ["session=abc", "theme=dark"]);
    assertIdentical(read.headers["x-request-id"], "request-1");
    assertIdentical(read.headers["user-agent"], "Mozilla/5.0");
  });

  it("sends the headers a whitelist names and no others", async () => {
    // Given a Behavior on the managed policy naming two headers.
    const read = await originReads({
      OriginRequestPolicyId:
        simCfManagedOriginRequestPolicyIds.userAgentRefererHeaders,
    });

    // Then those two travel.
    assertIdentical(read.headers["user-agent"], "Mozilla/5.0");
    assertIdentical(
      read.headers["referer"],
      "https://viewer.example.com/index.html",
    );

    // And nothing else the viewer sent does, cookies and query string
    // included.
    assertUndefined(read.headers["x-request-id"]);
    assertUndefined(read.headers["origin"]);
    assertArrayEquals(read.cookies, []);
    assertIdentical(read.query, "");
  });

  it("sends the CORS header a custom Origin needs and nothing more", async () => {
    // Given a Behavior on the managed policy for a CORS custom Origin.
    const read = await originReads({
      OriginRequestPolicyId:
        simCfManagedOriginRequestPolicyIds.corsCustomOrigin,
    });

    // Then the Origin can answer for the origin that asked, and reads nothing
    // else of the viewer.
    assertIdentical(read.headers["origin"], "https://viewer.example.com");
    assertUndefined(read.headers["referer"]);
    assertIdentical(read.query, "");
  });

  it("sends what the cache policy keyed on with no origin request policy", async () => {
    // Given a Behavior on a cache policy that keys on the `start` query string
    // and the `Origin` header, and names no origin request policy.
    const read = await originReads({
      CachePolicyId: simCfManagedCachePolicyIds.elementalMediaPackage,
    });

    // Then the Origin reads what the cache was keyed on, since it has to be
    // able to answer for the key it was asked about.
    assertIdentical(read.query, "start=10");
    assertIdentical(read.headers["origin"], "https://viewer.example.com");

    // And the viewer's own user agent, which the key left out, does not.
    assertIdentical(read.headers["user-agent"], "Amazon CloudFront");
  });

  it("sends the union of the cache policy and the origin request policy", async () => {
    // Given a Behavior keying its cache on the `start` query string and
    // forwarding the viewer's headers on top.
    const read = await originReads({
      CachePolicyId: simCfManagedCachePolicyIds.elementalMediaPackage,
      OriginRequestPolicyId:
        simCfManagedOriginRequestPolicyIds.userAgentRefererHeaders,
    });

    // Then the Origin reads the query string one named and the headers the
    // other did.
    assertIdentical(read.query, "start=10");
    assertIdentical(read.headers["user-agent"], "Mozilla/5.0");
  });

  it("asks the Origin for the compression the cache policy keyed on", async () => {
    // Given a Behavior on CachingOptimized, which caches an object compressed
    // and uncompressed apart.
    const read = await originReads({
      CachePolicyId: simCfManagedCachePolicyIds.cachingOptimized,
    });

    // Then the Origin is asked for the encodings the policy keyed on, rather
    // than for whatever the viewer happened to accept.
    assertIdentical(read.headers["accept-encoding"], "gzip, br");
  });
});
