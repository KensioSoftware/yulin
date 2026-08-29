import type { SimCloudFrontBehaviorResolver } from "../../resolver/sim-cloud-front-behavior-resolver.js";
import type { SimCloudFrontOriginFetcher } from "../origin/sim-cloudfront-origin-fetcher.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontCustomErrorPage } from "../../custom-error/sim-cloudfront-custom-error-response.js";

interface SimCfCustomErrorResponderProperties {
  readonly behaviourResolver: SimCloudFrontBehaviorResolver;
  readonly originFetcher: SimCloudFrontOriginFetcher;
}

/**
 * Replaces an Origin error response with a Distribution's custom error page.
 *
 * The response page is fetched as a request of its own, so the Cache Behavior
 * matching the response page path decides which Origin it comes from. That is
 * what lets a Distribution keep its error pages somewhere other than the
 * content that failed, as CloudFront does.
 *
 * A rule carrying `ErrorCachingMinTTL` alone has no page. The Origin's error
 * reaches the viewer, and the rule says how long the Distribution holds it
 * for.
 */
export class SimCfCustomErrorResponder {
  private readonly behaviourResolver: SimCloudFrontBehaviorResolver;
  private readonly originFetcher: SimCloudFrontOriginFetcher;

  constructor(properties: SimCfCustomErrorResponderProperties) {
    this.behaviourResolver = properties.behaviourResolver;
    this.originFetcher = properties.originFetcher;
  }

  /**
   * Return the custom error response for an Origin response, where the
   * Distribution configures one for its status.
   */
  async apply(
    request: Request,
    distribution: SimCloudFrontDistribution,
    response: Response,
  ): Promise<Response> {
    const page = distribution.customErrorResponses.find(
      (candidate) => candidate.errorCode === response.status,
    )?.page;

    if (page === undefined) {
      return response;
    }

    return await this.responsePage(request, distribution, page);
  }

  private async responsePage(
    request: Request,
    distribution: SimCloudFrontDistribution,
    page: SimCloudFrontCustomErrorPage,
  ): Promise<Response> {
    const pageRequest = this.pageRequest(request, page);
    const behaviour = this.behaviourResolver.resolve(pageRequest, distribution);
    const pageResponse = await this.originFetcher.fetch(
      pageRequest,
      distribution,
      behaviour,
    );

    // A response page that is itself unavailable leaves the viewer with the
    // status from fetching it, as it does in CloudFront.
    if (!pageResponse.ok) {
      return pageResponse;
    }

    return new Response(pageResponse.body, {
      status: page.responseCode,
      headers: pageResponse.headers,
    });
  }

  private pageRequest(
    request: Request,
    page: SimCloudFrontCustomErrorPage,
  ): Request {
    const url = new URL(request.url);
    url.pathname = page.responsePagePath;
    url.search = "";

    // The response page is fetched without a body, whatever the viewer sent,
    // so headers describing the viewer's body would describe nothing.
    const headers = new Headers(request.headers);
    headers.delete("content-type");
    headers.delete("content-length");

    return new Request(url, {
      method: request.method === "HEAD" ? "HEAD" : "GET",
      headers,
      redirect: request.redirect,
      signal: request.signal,
    });
  }
}
