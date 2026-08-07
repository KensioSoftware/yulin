import type {
  SimS3WebsiteConfiguration,
  SimS3WebsiteRedirect,
  SimS3WebsiteRoutingRule,
} from "../../../command/put-bucket-website/put-bucket-website.command.js";

/**
 * Redirect handling for simulated S3 Bucket static website configuration.
 */
export class S3BucketWebsiteRedirects {
  constructor(
    private readonly websiteConfiguration: SimS3WebsiteConfiguration = {},
  ) {}

  /**
   * Whether this S3 Bucket Website is configured to redirect all requests.
   */
  redirectsAllRequests(): boolean {
    return (
      this.websiteConfiguration.RedirectAllRequestsTo?.HostName !== undefined
    );
  }

  /**
   * Whether this S3 Bucket Website is configured with routing rules.
   */
  routingRulesSpecified(): boolean {
    return Boolean(
      this.websiteConfiguration.RoutingRules?.some(
        (rule) => rule.Redirect !== undefined,
      ),
    );
  }

  /**
   * Get the Response for a request and response pair based on this S3 Bucket
   * Website configuration.
   */
  redirectForRequestResponse(
    request: Request,
    response: Response,
    websiteEnabled: boolean,
  ): Response {
    if (!websiteEnabled) {
      return response;
    }

    const redirectAllRequestsTo =
      this.websiteConfiguration.RedirectAllRequestsTo;

    if (redirectAllRequestsTo !== undefined) {
      return this.redirectResponse(request, {
        HostName: redirectAllRequestsTo.HostName,
        Protocol: redirectAllRequestsTo.Protocol,
      });
    }

    const routingRule = this.websiteConfiguration.RoutingRules?.find((rule) =>
      this.routingRuleMatches(rule, request, response),
    );

    if (routingRule?.Redirect !== undefined) {
      return this.redirectResponse(request, routingRule.Redirect);
    }

    return response;
  }

  private routingRuleMatches(
    rule: SimS3WebsiteRoutingRule,
    request: Request,
    response: Response,
  ): boolean {
    const condition = rule.Condition;

    if (condition === undefined) {
      return true;
    }

    if (
      condition.HttpErrorCodeReturnedEquals !== undefined &&
      condition.HttpErrorCodeReturnedEquals !== String(response.status)
    ) {
      return false;
    }

    return (
      condition.KeyPrefixEquals === undefined ||
      this.requestKey(request).startsWith(condition.KeyPrefixEquals)
    );
  }

  private redirectResponse(
    request: Request,
    redirect: SimS3WebsiteRedirect,
  ): Response {
    const url = new URL(request.url);

    if (redirect.Protocol !== undefined) {
      url.protocol = `${redirect.Protocol}:`;
    }

    if (redirect.HostName !== undefined) {
      url.hostname = redirect.HostName;
      url.port = "";
    }

    if (redirect.ReplaceKeyWith !== undefined) {
      url.pathname = `/${redirect.ReplaceKeyWith}`;
    } else if (redirect.ReplaceKeyPrefixWith !== undefined) {
      url.pathname = `/${this.requestKey(request).replace(
        this.matchingKeyPrefix(request),
        // oxlint-disable-next-line unicorn-js/no-unsafe-string-replacement
        redirect.ReplaceKeyPrefixWith,
      )}`;
    }

    return new Response(undefined, {
      status: Number(redirect.HttpRedirectCode ?? "301"),
      headers: {
        location: url.href,
      },
    });
  }

  private requestKey(request: Request): string {
    const url = new URL(request.url);
    return url.pathname.replace(/^\/+/, "");
  }

  private matchingKeyPrefix(request: Request): string {
    const requestKey = this.requestKey(request);

    return (
      this.websiteConfiguration.RoutingRules?.find((rule) => {
        const keyPrefix = rule.Condition?.KeyPrefixEquals;
        return keyPrefix !== undefined && requestKey.startsWith(keyPrefix);
      })?.Condition?.KeyPrefixEquals ?? ""
    );
  }
}
