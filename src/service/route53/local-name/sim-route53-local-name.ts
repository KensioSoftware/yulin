import { SimAwsLocalUrl } from "../../../serve/http/url/sim-aws-local-url.js";

export const simRoute53LocalSuffix = SimAwsLocalUrl.localhostSuffix;

/**
 * Normalise a Route53 name for case-insensitive matching.
 */
export function normaliseSimRoute53Name(name: string): string {
  return name.toLowerCase().replaceAll(/\.+$/g, "");
}

/**
 * Render a Route53 name in absolute form, with the trailing dot AWS returns.
 *
 * This is the inverse of the trailing-dot stripping `normaliseSimRoute53Name`
 * applies, and belongs at output boundaries where stored names become
 * AWS-shaped command output.
 */
export function simRoute53AbsoluteName(name: string): string {
  return `${name}.`;
}

/**
 * Convert a Yulin-local Route53 name to a logical DNS name.
 */
export function simRoute53LogicalName(localName: string): string | undefined {
  const normalisedName = normaliseSimRoute53Name(localName);

  if (!normalisedName.endsWith(simRoute53LocalSuffix)) {
    return undefined;
  }

  return simRoute53LogicalHostname(normalisedName);
}

/**
 * Convert a hostname a client requested to a logical DNS name.
 *
 * The Yulin-local suffix is optional here, unlike in `simRoute53LogicalName`.
 * A hostname arriving over HTTP may carry it, because that is how a client
 * reaches the local server without the name resolving on the public internet,
 * or it may be the logical name itself, because the simulator's own DNS server
 * answers for logical names and can point a resolver straight at the local
 * server.
 */
export function simRoute53LogicalHostname(
  hostname: string,
): string | undefined {
  const normalisedName = normaliseSimRoute53Name(hostname);

  const logicalName = normalisedName.endsWith(simRoute53LocalSuffix)
    ? normalisedName.slice(0, -simRoute53LocalSuffix.length)
    : normalisedName;

  // Reject empty labels before normalization can hide malformed hostnames.
  if (logicalName.split(".").some((label) => label.length === 0)) {
    return undefined;
  }

  return logicalName;
}

/**
 * Convert a logical DNS name to a Yulin-local Route53 name.
 */
export function simRoute53LocalName(logicalName: string): string {
  const normalisedName = normaliseSimRoute53Name(logicalName);

  if (normalisedName.endsWith(simRoute53LocalSuffix)) {
    return normalisedName;
  }

  return `${normalisedName}${simRoute53LocalSuffix}`;
}
