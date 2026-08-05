import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

/**
 * Apply a Distribution's default root object to a request for its root.
 *
 * CloudFront substitutes the default root object for a request to the root of
 * the Distribution and nothing else: a request for a subdirectory such as
 * `/install/` is passed to the Origin as it arrived, even where that directory
 * holds a copy of the object. The substituted path is the one the rest of
 * request handling sees, so a Cache Behavior pattern and a CloudFront Function
 * both act on the object being served rather than on the root.
 *
 * The default root object applies to every method the Distribution allows, so
 * the request is rebuilt around the new path rather than being narrowed to a
 * GET.
 */
export function simCfDefaultRootObjectRequest(
  request: Request,
  distribution: SimCloudFrontDistribution,
): Request {
  const { defaultRootObject } = distribution;
  if (defaultRootObject === undefined) {
    return request;
  }

  const url = new URL(request.url);
  if (url.pathname !== "/") {
    return request;
  }

  url.pathname = `/${defaultRootObject}`;

  const isBodyAllowed = !/^(?:get|head)$/iu.test(request.method);

  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: isBodyAllowed ? request.clone().body : null,
    duplex: "half",
    redirect: request.redirect,
    signal: request.signal,
  });
}
