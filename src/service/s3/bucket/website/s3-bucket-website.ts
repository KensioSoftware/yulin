import type { WebsiteConfiguration } from "@aws-sdk/client-s3";

type WebsiteRoutingRule = NonNullable<
  WebsiteConfiguration["RoutingRules"]
>[number];

type WebsiteRedirect = NonNullable<WebsiteRoutingRule["Redirect"]>;

/**
 * Static website configuration for simulated S3 bucket.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/HostingWebsiteOnS3Setup.html
 */
export class S3BucketWebsite {
  constructor(
    private readonly websiteConfiguration: WebsiteConfiguration = {},
  ) {}

  /**
   * Is static website hosting enabled for this simulated S3 bucket?
   */
  websiteEnabled(): boolean {
    return (
      this.indexDocumentSpecified() ||
      this.errorDocumentSpecified() ||
      this.redirectsAllRequests() ||
      this.routingRulesSpecified()
    );
  }

  /**
   * Does this website configuration redirect all requests?
   */
  redirectsAllRequests(): boolean {
    return (
      this.websiteConfiguration.RedirectAllRequestsTo?.HostName !== undefined
    );
  }

  /**
   * Choose the S3 object key that should be served for a website request.
   */
  objectKeyForRequest(objectKey: string): string {
    const indexSuffix = this.websiteConfiguration.IndexDocument?.Suffix;

    if (indexSuffix === undefined) {
      return objectKey;
    }

    if (objectKey === "") {
      return indexSuffix;
    }

    if (objectKey.endsWith("/")) {
      return `${objectKey}${indexSuffix}`;
    }

    return objectKey;
  }

  /**
   * Get the S3 object key for this website's error document, if configured.
   */
  errorDocumentKey(): string | undefined {
    return this.websiteConfiguration.ErrorDocument?.Key;
  }

  /**
   * Choose an appropriate response for a request response pair based on static
   * website configuration for this simulated S3 bucket.
   */
  redirectForRequestResponse(req: Request, res: Response): Response {
    if (!this.websiteEnabled()) {
      return res;
    }

    const redirectAllRequestsTo =
      this.websiteConfiguration.RedirectAllRequestsTo;

    if (redirectAllRequestsTo !== undefined) {
      return this.redirectResponse(req, {
        HostName: redirectAllRequestsTo.HostName,
        Protocol: redirectAllRequestsTo.Protocol,
      });
    }

    const routingRule = this.websiteConfiguration.RoutingRules?.find((rule) =>
      this.routingRuleMatches(rule, req, res),
    );

    if (routingRule?.Redirect !== undefined) {
      return this.redirectResponse(req, routingRule.Redirect);
    }

    return res;
  }

  private routingRuleMatches(
    rule: WebsiteRoutingRule,
    req: Request,
    res: Response,
  ): boolean {
    const condition = rule.Condition;

    if (condition === undefined) {
      return true;
    }

    if (
      condition.HttpErrorCodeReturnedEquals !== undefined &&
      condition.HttpErrorCodeReturnedEquals !== String(res.status)
    ) {
      return false;
    }

    return !(
      condition.KeyPrefixEquals !== undefined &&
      !this.requestKey(req).startsWith(condition.KeyPrefixEquals)
    );
  }

  private redirectResponse(req: Request, redirect: WebsiteRedirect): Response {
    const url = new URL(req.url);

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
      url.pathname = `/${this.requestKey(req).replace(
        this.matchingKeyPrefix(req),
        redirect.ReplaceKeyPrefixWith,
      )}`;
    }

    return new Response(undefined, {
      status: Number(redirect.HttpRedirectCode ?? "301"),
      headers: {
        location: url.toString(),
      },
    });
  }

  private requestKey(req: Request): string {
    return new URL(req.url).pathname.replace(/^\/+/, "");
  }

  private matchingKeyPrefix(req: Request): string {
    const requestKey = this.requestKey(req);

    return (
      this.websiteConfiguration.RoutingRules?.find((rule) => {
        const keyPrefix = rule.Condition?.KeyPrefixEquals;
        return keyPrefix !== undefined && requestKey.startsWith(keyPrefix);
      })?.Condition?.KeyPrefixEquals ?? ""
    );
  }

  private indexDocumentSpecified(): boolean {
    return this.websiteConfiguration.IndexDocument?.Suffix !== undefined;
  }

  private errorDocumentSpecified(): boolean {
    return this.errorDocumentKey() !== undefined;
  }

  private routingRulesSpecified(): boolean {
    return Boolean(
      this.websiteConfiguration.RoutingRules?.some(
        (rule) => rule.Redirect !== undefined,
      ),
    );
  }
}
