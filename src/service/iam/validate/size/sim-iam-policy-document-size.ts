import { SimIamLimitExceeded } from "../../error/sim-iam.error.js";

/**
 * The longest managed policy document IAM will take.
 *
 * https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html
 */
export const maxSimIamManagedPolicyCharacters = 6144;

/**
 * The longest inline policy document IAM will take on a Role or a User.
 */
export const maxSimIamInlinePolicyCharacters = 10_240;

/**
 * The longest trust policy document IAM will take on a Role.
 *
 * This one is adjustable, up to 8,192 characters. A simulation holds the
 * default an account carries until it asks for more.
 */
export const maxSimIamTrustPolicyCharacters = 2048;

/**
 * The Role or the User an inline policy is being put onto.
 */
export interface SimIamPolicyDocumentHolder {
  /**
   * What IAM calls the holder in the message, `role` or `user`.
   */
  readonly kind: "role" | "user";

  /**
   * The holder's name.
   */
  readonly name: string;
}

/**
 * Measure a policy document the way IAM does, which leaves whitespace out.
 *
 * A document indented for a reader therefore counts the same as the one line
 * `JSON.stringify` produces, and a template can be written either way.
 */
export function simIamPolicyDocumentSize(policyDocument: string): number {
  return policyDocument.replaceAll(/\s/gu, "").length;
}

/**
 * Refuse a managed policy document over the character limit.
 *
 * A policy past the limit cannot be deployed, and the account keeps whichever
 * version last fit. The permission the document was grown to grant then goes
 * missing weeks later, at a distance from the change that lost it. Refusing
 * the document here puts the fault beside the policy that carries it.
 *
 * The requiredness check refuses an absent document. This one has nothing to
 * measure.
 */
export function assertSimIamManagedPolicyWithinSizeLimit(
  policyDocument: string | undefined,
): void {
  if (
    policyDocument === undefined ||
    simIamPolicyDocumentSize(policyDocument) <= maxSimIamManagedPolicyCharacters
  ) {
    return;
  }

  throw new SimIamLimitExceeded(
    `Cannot exceed quota for PolicySize: ${String(maxSimIamManagedPolicyCharacters)}`,
  );
}

/**
 * Refuse an inline policy document over the character limit.
 */
export function assertSimIamInlinePolicyWithinSizeLimit(
  policyDocument: string | undefined,
  holder: SimIamPolicyDocumentHolder,
): void {
  assertWithinMaximumPolicySize(
    policyDocument,
    maxSimIamInlinePolicyCharacters,
    holder,
  );
}

/**
 * Refuse a Role trust policy document over the character limit.
 */
export function assertSimIamTrustPolicyWithinSizeLimit(
  policyDocument: string | undefined,
  roleName: string,
): void {
  assertWithinMaximumPolicySize(
    policyDocument,
    maxSimIamTrustPolicyCharacters,
    { kind: "role", name: roleName },
  );
}

/**
 * IAM reports both of these in bytes, over a count that is really characters
 * with the whitespace taken out. The wording is kept as IAM writes it. A
 * reader searching for the message finds what a real deploy would have told
 * them.
 */
function assertWithinMaximumPolicySize(
  policyDocument: string | undefined,
  maxCharacters: number,
  holder: SimIamPolicyDocumentHolder,
): void {
  if (
    policyDocument === undefined ||
    simIamPolicyDocumentSize(policyDocument) <= maxCharacters
  ) {
    return;
  }

  throw new SimIamLimitExceeded(
    `Maximum policy size of ${String(maxCharacters)} bytes exceeded for ` +
      `${holder.kind} ${holder.name}`,
  );
}
