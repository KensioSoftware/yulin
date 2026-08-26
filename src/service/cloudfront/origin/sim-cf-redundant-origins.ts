import type { SimCloudFrontOriginConfig } from "../command/create-distribution/create-distribution.command.js";
import { assertDefined } from "../../../util/type-guard/defined.js";
import { simCfOriginCustomHeaders } from "./sim-cf-origin-custom-headers.js";

/**
 * One Origin that repeats another Origin of the same Distribution.
 */
export interface SimCfRedundantOrigin {
  /** The Id of the Origin that repeats an earlier one. */
  readonly originId: string;

  /** The Id of the earlier Origin it repeats. */
  readonly repeatsOriginId: string;

  /** The domain name both of them name. */
  readonly domainName: string;
}

/**
 * The Origins of a Distribution that repeat an earlier Origin of the same
 * Distribution.
 *
 * Two Origins over one domain name are legal and useful where they differ, by
 * `OriginPath`, by custom headers or by how CloudFront connects. Two that
 * differ only by `Id` are one Origin written twice. Both are served the same
 * way here, whichever Behavior points at them. One account served such a pair
 * differently, refusing every request on the second Behavior at the Origin,
 * for a reason CloudFront documents nowhere.
 *
 * Sameness is every property the config declares apart from the `Id`. An
 * Origin differing by a connection setting this simulation ignores is left
 * alone. A property written as an empty string counts as one left out (which
 * is how CloudFront reads an Origin's optional strings), and custom headers
 * count by name and value whatever order they were written in.
 */
export function findSimCfRedundantOrigins(
  origins: readonly SimCloudFrontOriginConfig[],
): readonly SimCfRedundantOrigin[] {
  const redundant: SimCfRedundantOrigin[] = [];
  const firstWithFingerprint = new Map<string, string>();

  for (const origin of origins) {
    assertDefined(origin.Id, "CloudFront Origin Id");
    assertDefined(origin.DomainName, "CloudFront Origin DomainName");

    const fingerprint = originFingerprint(origin, origin.Id);
    const repeatsOriginId = firstWithFingerprint.get(fingerprint);

    if (repeatsOriginId === undefined) {
      firstWithFingerprint.set(fingerprint, origin.Id);
      continue;
    }

    redundant.push({
      originId: origin.Id,
      repeatsOriginId,
      domainName: origin.DomainName,
    });
  }

  return redundant;
}

/**
 * Warn that a Distribution declares the same Origin more than once.
 *
 * Warnings go to the console, where a test runner surfaces them next to the
 * deploy that raised them. The simulator has no logger of its own to route
 * them through. A test asserts on the Distribution's own record of them.
 */
export function warnSimCfRedundantOrigins(
  distributionId: string,
  redundantOrigins: readonly SimCfRedundantOrigin[],
): void {
  for (const redundant of redundantOrigins) {
    // oxlint-disable-next-line no-console
    console.warn(
      `Simulated CloudFront Distribution ${distributionId} Origin ` +
        `${redundant.originId} repeats Origin ${redundant.repeatsOriginId}. ` +
        `Both name ${redundant.domainName} and match in every other ` +
        `property, one Origin written twice. Both Behaviors are served the ` +
        `same way here. One account served such a pair differently, refusing ` +
        `every request on one of the two Behaviors at the Origin. Give one ` +
        `Origin a difference, or point both Behaviors at the same Origin.`,
    );
  }
}

/**
 * What makes one Origin the same as another, as a string two Origins can be
 * compared by.
 */
function originFingerprint(
  origin: SimCloudFrontOriginConfig,
  originId: string,
): string {
  const {
    Id: _id,
    CustomHeaders: _customHeaders,
    OriginCustomHeaders: _originCustomHeaders,
    ...properties
  } = origin;

  return JSON.stringify([
    canonicalValue(properties),
    customHeaderPairs(origin, originId),
  ]);
}

/**
 * An Origin's custom headers as name and value pairs, in a settled order.
 *
 * These are the headers the Origin carries on a request it is sent, read the
 * way the request reads them. Names arrive lower-cased and a name written
 * twice keeps the value the Origin would send, whichever of the two field
 * names the config wrote them under.
 */
function customHeaderPairs(
  origin: SimCloudFrontOriginConfig,
  originId: string,
): readonly (readonly [string, string])[] {
  return Object.entries(simCfOriginCustomHeaders(originId, origin)).toSorted(
    ([left], [right]) => (left < right ? -1 : 1),
  );
}

/**
 * A value with its object keys in a settled order and everything unset left
 * out. Two configs saying the same thing then serialize the same way.
 */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => canonicalValue(item));
  }

  if (value === null || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, property]) => property !== undefined && property !== "")
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, property]) => [key, canonicalValue(property)]),
  );
}
