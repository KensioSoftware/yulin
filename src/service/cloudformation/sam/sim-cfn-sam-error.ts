/**
 * What a refusal names. The property comes first, then the SAM Resource that
 * declared it.
 */
export interface SamPropertyRefusal {
  /** The SAM Resource type the property was declared on. */
  readonly resourceType: string;
  /**
   * The logical ID of the SAM Resource. An implicit API carries the logical ID
   * SAM gives it, since that is the name a template reaches it by.
   */
  readonly logicalId: string;
  /** The property, written the way a template writes it. */
  readonly property: string;
  /** Why the expansion will not take it. */
  readonly reason: string;
}

/**
 * Build the error a property of a SAM Resource is refused with.
 *
 * The wording matters. Sim CloudFormation downgrades a failure whose message
 * reads as an unsupported Resource type into a skip, and a skipped `Auth` is
 * the dangerous case. The API is still deployed, the Stack looks right, and
 * every request reaches the function. So this says `Invalid`, and never says
 * `Unsupported sim`.
 *
 * The property is named separately from the Resource because an `Auth` block
 * is read several levels deep, and a refusal saying only which API failed
 * leaves the Stack owner hunting for the level that was wrong.
 */
export function samPropertyError(refusal: SamPropertyRefusal): Error {
  return new Error(
    `Invalid ${refusal.property} on ${refusal.resourceType} Resource ` +
      `${refusal.logicalId}: ${refusal.reason}`,
  );
}
