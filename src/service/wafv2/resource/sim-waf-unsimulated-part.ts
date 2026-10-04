/**
 * One part of a WAFv2 write this simulation holds and does not act on.
 *
 * A write carrying something Yulin does not simulate is accepted, and the read
 * that follows returns it as written. What the simulation leaves out is
 * reported here instead, so a test can find out how far the resource it wrote
 * is from the one AWS would run.
 */
export interface SimWafUnsimulatedPart {
  /**
   * Where the part sits in what was written.
   *
   * A rule is `Rules.<rule name>`, a web ACL member is its own name, and a body
   * inspection limit is `AssociationConfig.RequestBody.<resource type>`. These
   * are the names a CloudFormation Resource records them under.
   */
  readonly part: string;

  /** Why the simulation does not act on it. */
  readonly reason: string;
}

const tagsReason =
  "the tags are held and nothing reads them, since ListTagsForResource is " +
  "not simulated";

/**
 * What a resource's tags leave out, which is nothing when it has none.
 */
export function simWafTagsParts(
  tags: readonly unknown[],
): readonly SimWafUnsimulatedPart[] {
  return tags.length === 0 ? [] : [{ part: "Tags", reason: tagsReason }];
}
