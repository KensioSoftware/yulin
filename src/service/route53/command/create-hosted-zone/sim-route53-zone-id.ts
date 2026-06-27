import { faker } from "@faker-js/faker";
import type { Brand } from "../../../../util/brand.type.js";

export type SimRoute53HostedZoneId = Brand<string, "SimRoute53HostedZoneId">;

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
 * Normalize a Route53 Hosted Zone ID from either a bare zone ID or /hostedzone/
 * prefixed ID.
 */
export function normalizeSimRoute53HostedZoneId(
  value: string | undefined,
): SimRoute53HostedZoneId {
  const hostedZoneId = value?.replace(/^\/?hostedzone\//u, "");
  assertIsSimRoute53HostedZoneId(hostedZoneId);
  return hostedZoneId;
}

/**
 * Assert that a value is a sim Route53 Hosted Zone ID.
 */
export function assertIsSimRoute53HostedZoneId(
  value: unknown,
): asserts value is SimRoute53HostedZoneId {
  if (
    typeof value !== "string" ||
    !value.startsWith("Z") ||
    value.length !== 22
  ) {
    throw new Error("Not a SimRoute53HostedZoneId");
  }
}
