/**
 * What a policy document is attached to, for naming it when one of its
 * statements is rejected.
 */
export interface SimIamPolicyDocumentSubject {
  /**
   * The kind of thing the document is attached to, such as `Role` or `Bucket`.
   */
  readonly attachedTo: string;

  /**
   * The name of the thing the document is attached to.
   */
  readonly name: string;

  /**
   * The policy's own name, for a document stored under one.
   */
  readonly policyName?: string | undefined;
}

/**
 * Name one statement of a policy document, for a message about what is wrong
 * with it.
 *
 * A malformed statement usually arrives from a CloudFormation template. The
 * reader chasing one back needs the document it came from as well as the fault
 * in it. Statements carry no names of their own. The position in the document
 * stands in for one.
 */
export function simIamStatementLabel(
  index: number,
  subject?: SimIamPolicyDocumentSubject,
): string {
  const statement = `statement ${index + 1}`;

  if (subject === undefined) {
    return `IAM policy ${statement}`;
  }

  const policy =
    subject.policyName === undefined ? "" : ` policy "${subject.policyName}"`;

  return `${subject.attachedTo} "${subject.name}"${policy} ${statement}`;
}
