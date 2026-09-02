import { SimS3InvalidTag } from "../error/sim-s3.error.js";

/**
 * The most tags real S3 holds against one Object.
 */
const simS3MaxObjectTags = 10;

/**
 * One tag on an Object, in the form a request states it and a read hands it
 * back.
 */
export interface SimS3ObjectTag {
  readonly Key: string;
  readonly Value: string;
}

/**
 * One tag as it arrives, where a request is free to leave either half out.
 *
 * The SDK types both members optional, so a tag naming no key reaches the
 * simulator and is refused here rather than stored under an empty key.
 */
export interface SimS3ObjectTagInput {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * The tags one simulated S3 Object carries.
 *
 * Held as a map because a tag set is keyed: real S3 refuses two tags sharing a
 * key, and every question anything asks of a tag set is about the value under
 * one. The insertion order is the order the request stated, which is the order
 * a read hands them back in.
 *
 * A set is built once and never changed, so the Object holding it cannot have
 * its tags rewritten by whoever was handed them. `PutObjectTagging` replaces
 * the whole set, which is what real S3 does with one.
 *
 * https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-tagging.html
 */
export class SimS3ObjectTagSet {
  private readonly held: ReadonlyMap<string, string>;

  private constructor(held: ReadonlyMap<string, string>) {
    this.held = held;
  }

  /**
   * The tag set an Object nobody has tagged carries.
   */
  static empty(): SimS3ObjectTagSet {
    return new SimS3ObjectTagSet(new Map());
  }

  /**
   * The tag set a request states, refusing one real S3 would not hold.
   *
   * Both refusals are checked before anything is stored, so an Object is never
   * left carrying part of a tag set S3 would have rejected whole. The context
   * names the request, since the same tag set can arrive on a write, on a copy
   * or on a tagging request of its own.
   */
  static from(
    tags: readonly SimS3ObjectTagInput[],
    context: string,
  ): SimS3ObjectTagSet {
    if (tags.length > simS3MaxObjectTags) {
      throw new SimS3InvalidTag(
        `The tag set of ${context} holds ${tags.length} tags. An S3 Object ` +
          `holds at most ${simS3MaxObjectTags}.`,
      );
    }

    const held = new Map<string, string>();

    for (const tag of tags) {
      const key = tag.Key;

      if (key === undefined || key.length === 0) {
        throw new SimS3InvalidTag(`A tag of ${context} names no key.`);
      }

      if (held.has(key)) {
        throw new SimS3InvalidTag(
          `The tag set of ${context} states the key ${key} twice. An S3 ` +
            `Object holds one value under each tag key.`,
        );
      }

      held.set(key, tag.Value ?? "");
    }

    return new SimS3ObjectTagSet(held);
  }

  /**
   * The tags, in the order the request that set them stated.
   */
  get tags(): readonly SimS3ObjectTag[] {
    return this.held
      .entries()
      .map(([Key, Value]) => ({ Key, Value }))
      .toArray();
  }

  /**
   * Whether this Object carries exactly this tag.
   *
   * Both halves have to match, because that is what a lifecycle rule filtering
   * on a tag asks: a rule for `archive=true` says nothing about an Object
   * tagged `archive=false`.
   */
  has(key: string, value: string): boolean {
    return this.held.get(key) === value;
  }
}
