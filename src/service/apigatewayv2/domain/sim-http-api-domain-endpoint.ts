import { faker } from "@faker-js/faker";

import type { Brand } from "../../../util/brand.type.js";
import {
  executeApiDomain,
  executeApiHostLabel,
} from "../api/sim-http-api-host.js";

/**
 * The first character of the id API Gateway allocates a custom domain, which
 * is what tells its endpoint hostname apart from the one an API gets.
 */
const domainIdPrefix = "d-";

/**
 * The id API Gateway allocates for the regional endpoint of one custom domain,
 * which is the leading DNS label of that endpoint's hostname.
 */
export type SimHttpApiDomainId = Brand<string, "SimHttpApiDomainId">;

/**
 * What a custom domain's regional endpoint hostname is built from.
 */
export interface SimHttpApiDomainEndpointParts {
  readonly domainId: SimHttpApiDomainId;
  readonly regionName: string;
}

/**
 * Allocate a domain endpoint id in the shape real API Gateway uses: `d-`
 * followed by 10 lowercase alphanumeric characters, forming one DNS label.
 */
export function makeSimHttpApiDomainId(): SimHttpApiDomainId {
  return `${domainIdPrefix}${faker.helpers.fromRegExp(/[a-z0-9]{10}/)}` as SimHttpApiDomainId;
}

/**
 * Whether a DNS label is a custom domain endpoint id rather than an API id.
 *
 * A custom domain and an API are issued endpoints of the same shape, so this
 * is what decides which of the two a hostname names. API ids carry no hyphen,
 * which is what leaves the prefix free to say it.
 */
export function isSimHttpApiDomainId(label: string): boolean {
  return label.startsWith(domainIdPrefix);
}

/**
 * Build the real AWS endpoint hostname for a custom domain, which is what
 * `RegionalDomainName` answers with and what a record for the custom domain
 * name points at.
 */
export function simHttpApiDomainEndpointHost(
  parts: SimHttpApiDomainEndpointParts,
): string {
  return `${simHttpApiDomainEndpointLogicalHost(parts)}.${executeApiDomain}`;
}

/**
 * Build the logical hostname for a custom domain endpoint: the AWS endpoint
 * hostname without the real AWS domain, which is the form Yulin serves on
 * localhost.
 */
export function simHttpApiDomainEndpointLogicalHost(
  parts: SimHttpApiDomainEndpointParts,
): string {
  return `${parts.domainId}.${executeApiHostLabel}.${parts.regionName}`;
}

/**
 * A custom domain's regional endpoint hostname, as it was read.
 */
export interface SimHttpApiDomainEndpointHost {
  /**
   * The hostname without the AWS domain, which is the name simulated DNS
   * resolves and the domain registry holds.
   */
  readonly logicalHost: string;
  readonly regionName: string;
}

/**
 * Read a custom domain's regional endpoint hostname, in either the form real
 * API Gateway reports it or the local form the AWS domain is dropped from.
 *
 * Both forms are read here because a request arriving over HTTP has had the
 * AWS domain rewritten away and a record value written as `RegionalDomainName`
 * answered has not, and a record pointing the custom domain name at the
 * endpoint is how the domain is reached on AWS.
 */
export function readSimHttpApiDomainEndpointHost(
  hostname: string,
): SimHttpApiDomainEndpointHost | undefined {
  const awsDomainSuffix = `.${executeApiDomain}`;
  const logicalHost = hostname.endsWith(awsDomainSuffix)
    ? hostname.slice(0, -awsDomainSuffix.length)
    : hostname;
  const labels = logicalHost.split(".");

  if (labels.length !== 3) {
    return undefined;
  }

  const [domainId, service, regionName] = labels;

  if (
    domainId === undefined ||
    regionName === undefined ||
    service !== executeApiHostLabel ||
    !isSimHttpApiDomainId(domainId)
  ) {
    return undefined;
  }

  return { logicalHost, regionName };
}
