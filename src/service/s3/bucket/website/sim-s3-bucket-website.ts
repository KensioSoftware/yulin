import type { SimS3WebsiteConfiguration } from "../../command/put-bucket-website/put-bucket-website.cmd.js";
import { S3BucketWebsiteRedirects } from "./redirect/s3-bucket-website-redirects.js";

/**
 * Static website configuration for simulated S3 bucket.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/HostingWebsiteOnS3Setup.html
 */
export class SimS3BucketWebsite {
  private readonly redirects: S3BucketWebsiteRedirects;

  constructor(
    private readonly websiteConfiguration: SimS3WebsiteConfiguration = {},
  ) {
    this.redirects = new S3BucketWebsiteRedirects(websiteConfiguration);
  }

  /**
   * Is static website hosting enabled for this simulated S3 bucket?
   */
  websiteEnabled(): boolean {
    return (
      this.indexDocumentSpecified() ||
      this.errorDocumentSpecified() ||
      this.redirectsAllRequests() ||
      this.redirects.routingRulesSpecified()
    );
  }

  /**
   * Does this website configuration redirect all requests?
   */
  redirectsAllRequests(): boolean {
    return this.redirects.redirectsAllRequests();
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
   * Get the index document key that would be served after redirecting this
   * request to a slash-terminated folder URL, if an index document is configured.
   */
  folderIndexDocumentKeyForRequest(objectKey: string): string | undefined {
    const indexSuffix = this.websiteConfiguration.IndexDocument?.Suffix;

    if (
      indexSuffix === undefined ||
      objectKey === "" ||
      objectKey.endsWith("/")
    ) {
      return undefined;
    }

    return `${objectKey}/${indexSuffix}`;
  }

  /**
   * Redirect this request to the same URL with a trailing slash on the path.
   */
  trailingSlashRedirect(req: Request): Response {
    const url = new URL(req.url);

    url.pathname = `${url.pathname}/`;

    return new Response(undefined, {
      status: 301,
      headers: {
        location: url.toString(),
      },
    });
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
    return this.redirects.redirectForRequestResponse(
      req,
      res,
      this.websiteEnabled(),
    );
  }

  private indexDocumentSpecified(): boolean {
    return this.websiteConfiguration.IndexDocument?.Suffix !== undefined;
  }

  private errorDocumentSpecified(): boolean {
    return this.errorDocumentKey() !== undefined;
  }
}
