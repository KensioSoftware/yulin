import { SimSesBadRequestException } from "../error/sim-ses.error.js";

/**
 * The address inside `Display Name <address@example.com>`, if it is written
 * that way.
 */
const displayNamePattern = /<([^<>]+)>\s*$/;

/**
 * The bare address out of a header value.
 *
 * SES accepts both `orders@example.com` and `Orders <orders@example.com>`
 * wherever an address goes, and the identity check applies to the address
 * either way. What a recorded send keeps is the value as it was given, so a
 * test asserting on the display name still can; this is only what the identity
 * check reads.
 */
export function simSesBareAddress(address: string): string {
  return (displayNamePattern.exec(address)?.[1] ?? address).trim();
}

/**
 * Read an address SES is being asked to send from, refusing an empty one.
 */
export function requiredSimSesFromAddress(fromEmailAddress?: string): string {
  const address = fromEmailAddress?.trim() ?? "";

  if (address.length === 0) {
    throw new SimSesBadRequestException("Missing required header 'From'.");
  }

  return address;
}
