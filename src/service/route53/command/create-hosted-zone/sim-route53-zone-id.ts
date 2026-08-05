import { faker } from "@faker-js/faker";
import type { Brand } from "../../../../util/brand.type.js";
import { SimRoute53InvalidInput } from "../../error/sim-route53.error.js";

export type SimRoute53HostedZoneId = Brand<string, "SimRoute53HostedZoneId">;

/**
 * Route53 Hosted Zone IDs are a `Z` prefix followed by uppercase alphanumerics.
 * Real IDs are not a fixed length: the API documents a maximum of 32
 * characters, and IDs in the wild are commonly 14 or 21 characters. Only the
 * shape is checked so real IDs copied from an AWS account are accepted.
 *
 * https://docs.aws.amazon.com/Route53/latest/APIReference/API_HostedZone.html
 */
const simRoute53HostedZoneIdPattern = /^Z[\dA-Z]{1,31}$/u;

/**
 * Allocate a unique simulated Route53 Hosted Zone ID.
 */
export function makeSimRoute53HostedZoneId(
  existing = new Set<SimRoute53HostedZoneId>(),
): SimRoute53HostedZoneId {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const hostedZoneId = `Z${faker.string
      .alphanumeric({ length: 21 })
      .toUpperCase()}` as SimRoute53HostedZoneId;

    if (!existing.has(hostedZoneId)) {
      return hostedZoneId;
    }
  }

  /* v8 ignore next -- unlikely to happen in practice */
  throw new Error("Could not allocate unique Route53 Hosted Zone ID");
}

/**
 * Normalize a caller-supplied Route53 Hosted Zone ID from either a bare zone ID
 * or /hostedzone/ prefixed ID.
 *
 * A malformed ID is rejected here with InvalidInput. A well-formed ID that no
 * simulated hosted zone owns is left to fail later with NoSuchHostedZone.
 */
export function normalizeSimRoute53HostedZoneId(
  value: string | undefined,
): SimRoute53HostedZoneId {
  const hostedZoneId = value?.replace(/^\/?hostedzone\//u, "");

  if (!isSimRoute53HostedZoneId(hostedZoneId)) {
    throw new SimRoute53InvalidInput(
      `Invalid Route53 Hosted Zone ID: ${value ?? "(missing)"}`,
    );
  }

  return hostedZoneId;
}

/**
 * Whether a value has the shape of a Route53 Hosted Zone ID.
 */
export function isSimRoute53HostedZoneId(
  value: unknown,
): value is SimRoute53HostedZoneId {
  return typeof value === "string" && simRoute53HostedZoneIdPattern.test(value);
}

/**
 * Assert that a value is a sim Route53 Hosted Zone ID.
 */
export function assertIsSimRoute53HostedZoneId(
  value: unknown,
): asserts value is SimRoute53HostedZoneId {
  if (!isSimRoute53HostedZoneId(value)) {
    throw new Error("Not a SimRoute53HostedZoneId");
  }
}
