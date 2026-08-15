import { SimAwsLocalUrl } from "../../../../serve/http/url/sim-aws-local-url.js";

interface SimCfCustomOriginRequestProperties {
  readonly domainName: string;
  readonly originPath: string;
  readonly request: Request;
  /**
   * Headers stating who the Origin request is from, which an Origin whose
   * origin access control signs carries and an anonymous one does not.
   */
  readonly signingHeaders?: Readonly<Record<string, string>> | undefined;
}

/**
 * Build the request sim CloudFront sends on to a custom Origin.
 *
 * CloudFront keeps the viewer's method, headers, query string and body, sends
 * the Origin's own domain as the host, and prefixes the Origin path to the
 * request path. The Origin domain is rewritten to its Yulin-local form here,
 * so that an AWS endpoint hostname is resolved by the same host handling that
 * serves the simulated environment on localhost.
 */
export function simCfCustomOriginRequest(
  properties: SimCfCustomOriginRequestProperties,
): Request {
  const { request } = properties;
  const viewerUrl = new URL(request.url);

  const originUrl = new SimAwsLocalUrl({
    input: `https://${properties.domainName}`,
  }).toURL();
  originUrl.pathname = originRequestPath(
    properties.originPath,
    viewerUrl.pathname,
  );
  originUrl.search = viewerUrl.search;

  const headers = new Headers(request.headers);
  headers.set("host", originUrl.host);

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
 * Prefix the Origin path to the request path, as CloudFront does.
 */
function originRequestPath(originPath: string, viewerPath: string): string {
  return `/${originPath}/${viewerPath}`.replaceAll(/\/{2,}/gu, "/");
}
