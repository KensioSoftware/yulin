/**
 * One entry of a CORS policy's `AccessControlAllowOrigins` list.
 *
 * CloudFront allows the wildcard on its own, meaning every Origin, and as the
 * leftmost subdomain of a host, meaning any one subdomain of it. It allows the
 * wildcard nowhere else: not as a top-level domain (`example.*`), to the right
 * of a subdomain (`test.*.example.org`), within one (`*test.example.org`), or
 * inside a term (`exa*mple.org`).
 *
 * https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/understanding-response-headers-policies.html
 */

interface SimCfCorsOrigin {
  readonly scheme: string | undefined;
  readonly host: string;
}

/**
 * Whether an allow-list entry places its wildcard where CloudFront allows one.
 *
 * An entry with no wildcard is always well formed, and so is the bare wildcard.
 */
export function simCfCorsOriginPatternIsValid(pattern: string): boolean {
  if (pattern === "*" || !pattern.includes("*")) {
    return true;
  }

  const { host } = splitOrigin(pattern);

  return host.startsWith("*.") && !host.slice(2).includes("*");
}

/**
 * Whether one allow-list entry matches the `Origin` a request carried.
 *
 * A wildcard entry stands for exactly one label, as a wildcard certificate
 * does, so `*.example.org` matches `https://site.example.org` and does not
 * match `https://deep.site.example.org`. An entry naming no scheme matches the
 * host whichever scheme the request used.
 */
export function simCfCorsOriginPatternMatches(
  pattern: string,
  requestOrigin: string,
): boolean {
  if (pattern === requestOrigin) {
    return true;
  }

  if (!pattern.includes("*")) {
    return false;
  }

  const patternOrigin = splitOrigin(pattern);
  const origin = splitOrigin(requestOrigin);

  if (
    patternOrigin.scheme !== undefined &&
    patternOrigin.scheme !== origin.scheme
  ) {
    return false;
  }

  return hostMatches(patternOrigin.host, origin.host);
}

/**
 * Whether a `*.example.org` host pattern covers the host of a request Origin.
 */
function hostMatches(patternHost: string, host: string): boolean {
  if (!patternHost.startsWith("*.")) {
    return false;
  }

  const suffix = patternHost.slice(1);

  if (!host.endsWith(suffix)) {
    return false;
  }

  const label = host.slice(0, -suffix.length);

  return label.length > 0 && !label.includes(".");
}

/**
 * An Origin split into the scheme it names, if any, and the rest of it.
 */
function splitOrigin(origin: string): SimCfCorsOrigin {
  const separator = origin.indexOf("://");

  return separator === -1
    ? { scheme: undefined, host: origin }
    : { scheme: origin.slice(0, separator), host: origin.slice(separator + 3) };
}
