import { createHash } from "node:crypto";

/** How long a real Easy DKIM token is. */
const tokenLength = 32;

/**
 * The three DKIM tokens CloudFormation reports for an email identity.
 *
 * Real SES generates these when it sets up Easy DKIM, and a template publishes
 * them as CNAME records so SES can find them. Nothing here signs or verifies
 * anything, so there is no key to derive a token from and these are made up.
 *
 * They are made up deterministically, from the identity's own name, for the
 * reason every generated name in this simulation is: a test that deploys the
 * same template twice gets the same records, and two identities in one stack
 * do not collide.
 *
 * Producing them at all is the deliberate part. The obvious alternative is to
 * refuse a DKIM token attribute, but `ses.Identity.publicHostedZone()` in CDK
 * emits three Route53 record sets reading exactly these, so refusing would
 * take down an ordinary stack over records nothing in this simulation reads.
 */
export function simSesDkimTokens(emailIdentity: string): readonly string[] {
  return [1, 2, 3].map((index) =>
    createHash("sha256")
      .update(`${emailIdentity}:dkim:${String(index)}`)
      .digest("hex")
      .slice(0, tokenLength),
  );
}

/**
 * The name of the CNAME record a DKIM token is published under.
 */
export function simSesDkimTokenName(
  emailIdentity: string,
  token: string,
): string {
  return `${token}._domainkey.${simSesDkimDomain(emailIdentity)}`;
}

/**
 * What that record points at.
 */
export function simSesDkimTokenValue(token: string): string {
  return `${token}.dkim.amazonses.com`;
}

/**
 * The domain the records belong to, which for an address identity is the
 * domain the address is at.
 */
function simSesDkimDomain(emailIdentity: string): string {
  return emailIdentity.slice(emailIdentity.lastIndexOf("@") + 1);
}
