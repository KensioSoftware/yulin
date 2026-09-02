import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";
import {
  isSimAwsLocalRequest,
  simAwsRequestHostname,
} from "../../../../serve/http/url/sim-aws-request-hostname.js";
import { stripSimAwsControlHeaders } from "../../../iam/request/sim-aws-control-headers.js";
import type { SimCloudFrontBehavior } from "../../behaviour/sim-cloud-front-behavior.js";
import type { SimCfForwardedToOrigin } from "../../origin-request-policy/sim-cf-forwarded-to-origin.js";
import {
  simCfForwardedOriginHeaders,
  simCfForwardedOriginSearch,
} from "./sim-cf-custom-origin-forwarding.js";

interface SimCfCustomOriginRequestProperties {
  readonly domainName: string;
  readonly originPath: string;
  readonly request: Request;
  readonly viewerProtocolPolicy?:
    | SimCloudFrontBehavior["viewerProtocolPolicy"]
    | undefined;
  /**
   * What the Behavior's cache policy and origin request policy carry to the
   * Origin between them.
   */
  readonly forwarded: SimCfForwardedToOrigin;
  /**
   * The Origin's own custom headers, keyed by lower-case header name.
   */
  readonly customHeaders?: Readonly<Record<string, string>> | undefined;
  /**
   * Headers stating who the Origin request is from and what its signature
   * covers, which an Origin whose origin access control signs carries and an
   * anonymous one does not.
   */
  readonly signingHeaders?: Readonly<Record<string, string>> | undefined;
}

/**
 * Build the request sim CloudFront sends on to a custom Origin.
 *
 * CloudFront keeps the viewer's method and body, prefixes the Origin path to
 * the request path, and sends the Origin's own domain as the host. Of the
 * viewer's headers, cookies and query strings it sends what the Behavior's two
 * policies name between them and drops the rest. An Origin reads what the
 * Distribution was configured to tell it.
 *
 * The Origin domain is rewritten to its Yulin-local form here, so that an AWS
 * endpoint hostname is resolved by the same host handling that serves the
 * simulated environment on localhost.
 */
export function simCfCustomOriginRequest(
  properties: SimCfCustomOriginRequestProperties,
): Request {
  const { request, forwarded } = properties;
  const viewerUrl = new URL(request.url);

  const originUrl = new SimAwsLocalUrl({
    input: `https://${properties.domainName}`,
  }).toURL();
  originUrl.pathname = originRequestPath(
    properties.originPath,
    viewerUrl.pathname,
  );
  originUrl.search = simCfForwardedOriginSearch(viewerUrl.search, forwarded);

  const headers = simCfForwardedOriginHeaders(request.headers, forwarded);

  applyAwsFacingViewerOrigin(headers, request, properties.viewerProtocolPolicy);
  headers.set("host", originUrl.host);

  // Who the Origin request is from is the Origin's business, not the viewer's,
  // so a viewer's own control headers are dropped before the Origin's are
  // applied. A viewer reaching a Distribution through the HTTP boundary has
  // had them stripped already; one reaching a controller in process has not,
  // and either way an unsigned Origin should state nothing.
  stripSimAwsControlHeaders(headers);

  // A viewer sending a header the Origin also configures has its value
  // replaced, as CloudFront replaces it. That is what stops a viewer spoofing
  // a header the origin trusts by sending it through the Distribution.
  const customHeaders = Object.entries(properties.customHeaders ?? {});

  for (const [name, value] of customHeaders) {
    headers.set(name, value);
  }

  const signingHeaders = Object.entries(properties.signingHeaders ?? {});

  for (const [name, value] of signingHeaders) {
    headers.set(name, value);
  }

  const isBodyAllowed = !/^(?:get|head)$/iu.test(request.method);

  return new Request(originUrl, {
    method: request.method,
    headers,
    body: isBodyAllowed ? request.clone().body : null,
    duplex: "half",
    redirect: request.redirect,
    signal: request.signal,
  });
}

/**
 * Replace the local same-origin value a browser sends with the origin the
 * viewer would use against CloudFront.
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/RequestAndResponseBehaviorCustomOrigin.html
 */
function applyAwsFacingViewerOrigin(
  headers: Headers,
  viewerRequest: Request,
  viewerProtocolPolicy: SimCloudFrontBehavior["viewerProtocolPolicy"],
): void {
  const value = headers.get("origin");

  if (value === null || !isSimAwsLocalRequest(viewerRequest)) {
    return;
  }

  const origin = originUrl(value);
  if (origin === undefined || origin.origin !== viewerOrigin(viewerRequest)) {
    return;
  }

  origin.hostname = simAwsRequestHostname(viewerRequest);
  origin.port = "";

  if (
    viewerProtocolPolicy === "redirect-to-https" ||
    viewerProtocolPolicy === "https-only"
  ) {
    origin.protocol = "https:";
  }

  headers.set("origin", origin.origin);
}

/**
 * The local origin the viewer used, including the Host header when it differs
 * from the Request URL.
 */
function viewerOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("host");

  if (host !== null) {
    url.host = host;
  }

  return url.origin;
}

/**
 * Read a serialized Origin without rejecting the request when it is `null` or
 * malformed. CloudFront forwards those values unchanged.
 */
function originUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

/**
 * Prefix the Origin path to the request path, as CloudFront does.
 */
function originRequestPath(originPath: string, viewerPath: string): string {
  return `/${originPath}/${viewerPath}`.replaceAll(/\/{2,}/gu, "/");
}
