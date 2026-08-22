import type { SimCloudFrontOriginConfig } from "../command/create-distribution/create-distribution.command.js";
import { SimCloudFrontInvalidArgument } from "../error/sim-cloudfront.error.js";

/**
 * The header names CloudFront refuses to add to an Origin request.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html
 */
const deniedHeaderNames = new Set([
  "cache-control",
  "connection",
  "content-length",
  "cookie",
  "host",
  "if-match",
  "if-modified-since",
  "if-none-match",
  "if-range",
  "if-unmodified-since",
  "max-forwards",
  "pragma",
  "proxy-authenticate",
  "proxy-authorization",
  "proxy-connection",
  "range",
  "request-range",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "via",
  "x-real-ip",
]);

/**
 * The header name prefixes CloudFront refuses alongside the names above.
 */
const deniedHeaderPrefixes = ["x-amz-", "x-edge-"];

/**
 * Read the custom headers an Origin was configured with.
 *
 * CloudFront adds these to every request it sends to the Origin, which is how
 * an origin tells a request that came through the Distribution from one that
 * reached it directly. A header name CloudFront refuses to add fails here, as
 * CloudFront fails the Distribution over one.
 *
 * The header names are lower-cased on the way in. HTTP header names are
 * case-insensitive, and lower-casing them here is what makes a configured
 * header overwrite a viewer header written in another case.
 */
export function simCfOriginCustomHeaders(
  originId: string,
  origin: SimCloudFrontOriginConfig,
): Readonly<Record<string, string>> {
  const items = (origin.CustomHeaders ?? origin.OriginCustomHeaders)?.Items;

  if (items === undefined) {
    return {};
  }

  return Object.fromEntries(
    items.map((item) => [
      assertHeaderName(originId, item.HeaderName),
      item.HeaderValue ?? "",
    ]),
  );
}

/**
 * Refuse a header name CloudFront has no way to add.
 */
function assertHeaderName(
  originId: string,
  headerName: string | undefined,
): string {
  if (headerName === undefined || headerName.length === 0) {
    throw new SimCloudFrontInvalidArgument(
      `Sim CloudFront Origin ${originId} has a custom header with no HeaderName`,
    );
  }

  const name = headerName.toLowerCase();

  if (
    deniedHeaderNames.has(name) ||
    deniedHeaderPrefixes.some((prefix) => name.startsWith(prefix))
  ) {
    throw new SimCloudFrontInvalidArgument(
      `Sim CloudFront Origin ${originId} custom header ${headerName} is one ` +
        `CloudFront refuses to add to an Origin request. See ` +
        `https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/add-origin-custom-headers.html`,
    );
  }

  return name;
}
