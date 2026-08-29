import type { SimCloudFrontCacheKey } from "../cache-policy/sim-cf-cache-key.js";

/**
 * The compression the policy keys on, as CloudFront's normalized
 * `Accept-Encoding`.
 *
 * This is what caches one object twice, once compressed and once not, without
 * the header being in the policy's whitelist. An encoding the viewer accepts
 * but the policy does not enable is left out, since CloudFront would not have
 * asked the Origin for it.
 */
export function simCfNormalizedAcceptEncoding(
  headers: Headers,
  cacheKey: SimCloudFrontCacheKey,
): string[] {
  const enabled = [
    ...(cacheKey.enableAcceptEncodingBrotli ? ["br"] : []),
    ...(cacheKey.enableAcceptEncodingGzip ? ["gzip"] : []),
  ];
  const accepted = acceptedEncodings(headers.get("accept-encoding"));

  return enabled.filter((encoding) => accepted.has(encoding));
}

/**
 * The encodings a viewer said it accepts, by name alone. A quality value is
 * ignored, so a viewer that sent `gzip;q=0` is taken to accept gzip.
 */
function acceptedEncodings(headerValue: string | null): Set<string> {
  return new Set(
    (headerValue ?? "").split(",").map((encoding) => {
      const [name = ""] = encoding.split(";", 1);

      return name.trim().toLowerCase();
    }),
  );
}
