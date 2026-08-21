import { SimSesBadRequestException } from "../error/sim-ses.error.js";

/**
 * What kind of thing an SES identity names.
 *
 * Real SES has a third, `MANAGED_DOMAIN`, which only its own managed sending
 * domains carry. Nothing here can create one, so nothing here reports one.
 */
export type SimSesIdentityType = "EMAIL_ADDRESS" | "DOMAIN";

const maximumLength = 320;
const maximumLabelLength = 63;

/** What a domain label may be made of. */
const labelCharacters = /^[a-z0-9-]+$/i;

/** What a domain has to end with: a dot and at least two letters. */
const topLevelLabel = /\.[a-z]{2,}$/i;

/**
 * Read an SES identity, refusing one real SES would refuse.
 *
 * An identity is either an email address or a domain, and which one it is
 * follows from whether it has an `@` in it. That is how SES itself decides:
 * there is no parameter saying which kind is meant.
 */
export function requiredSimSesIdentityName(emailIdentity?: string): string {
  if (emailIdentity === undefined || emailIdentity.length === 0) {
    throw new SimSesBadRequestException(
      "1 validation error detected: Value at 'emailIdentity' failed to " +
        "satisfy constraint: Member must not be null",
    );
  }

  if (emailIdentity.length > maximumLength) {
    throw new SimSesBadRequestException(
      `1 validation error detected: Value at 'emailIdentity' failed to ` +
        `satisfy constraint: Member must have length less than or equal to ` +
        `${maximumLength}`,
    );
  }

  if (!isSimSesIdentityName(emailIdentity)) {
    throw new SimSesBadRequestException(
      `Invalid identity: ${emailIdentity}. An identity is an email address ` +
        `or a domain.`,
    );
  }

  return emailIdentity;
}

/**
 * Which kind of identity a name is.
 */
export function simSesIdentityType(emailIdentity: string): SimSesIdentityType {
  return emailIdentity.includes("@") ? "EMAIL_ADDRESS" : "DOMAIN";
}

/**
 * The domain part of an identity: the whole of a domain identity, and what
 * follows the `@` of an address one.
 */
export function simSesIdentityDomain(emailIdentity: string): string {
  return emailIdentity.slice(emailIdentity.lastIndexOf("@") + 1).toLowerCase();
}

/**
 * How an identity is keyed, so that two spellings of the same thing meet.
 *
 * Domains are case insensitive, so they are keyed in lower case. The local
 * part of an address is not, per RFC 5321, so it is keyed as it was given:
 * `Sales@example.com` and `sales@example.com` are two identities here, as they
 * are two mailboxes in principle, while `sales@EXAMPLE.com` is the same one.
 */
export function simSesIdentityKey(emailIdentity: string): string {
  const domain = simSesIdentityDomain(emailIdentity);

  if (simSesIdentityType(emailIdentity) === "DOMAIN") {
    return domain;
  }

  return `${emailIdentity.slice(0, emailIdentity.lastIndexOf("@"))}@${domain}`;
}

/**
 * Whether a name is an email address or a domain, which is the whole of what
 * an SES identity may be.
 */
export function isSimSesIdentityName(emailIdentity: string): boolean {
  if (!emailIdentity.includes("@")) {
    return isDomain(emailIdentity);
  }

  const localPart = emailIdentity.slice(0, emailIdentity.lastIndexOf("@"));

  return (
    localPart.length > 0 &&
    !localPart.includes("@") &&
    isDomain(simSesIdentityDomain(emailIdentity))
  );
}

/**
 * Whether a name is a domain: two or more dot separated labels, the last of
 * them alphabetic.
 *
 * Checked label by label rather than with one pattern covering the whole
 * thing. A pattern for a repeated group of repeated characters backtracks
 * badly on a long near miss, and splitting first is both linear and easier to
 * read.
 */
function isDomain(value: string): boolean {
  const labels = value.split(".");

  return (
    labels.length >= 2 &&
    topLevelLabel.test(value) &&
    labels.every((label) => isDomainLabel(label))
  );
}

function isDomainLabel(label: string): boolean {
  return (
    label.length > 0 &&
    label.length <= maximumLabelLength &&
    labelCharacters.test(label) &&
    !label.startsWith("-") &&
    !label.endsWith("-")
  );
}
