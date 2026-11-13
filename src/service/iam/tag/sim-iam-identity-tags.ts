import {
  SimIamInvalidInput,
  SimIamLimitExceeded,
} from "../error/sim-iam.error.js";

/**
 * One tag as IAM's API describes it.
 */
export interface SimIamTag {
  readonly Key: string;
  readonly Value: string;
}

/**
 * One tag as a request carries it, before IAM has checked it.
 */
export interface SimIamTagInput {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * The most tags one Role or User may carry, and the most one request may set.
 */
const maxTags = 50;

const keyPattern = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]{1,128}$/u;
const valuePattern = /^[\p{L}\p{Z}\p{N}_.:/=+\-@]{0,256}$/u;

/**
 * The tags on one IAM Role or User.
 *
 * IAM compares the keys of a Role's or a User's tags without regard to case
 * and keeps the case they were written in. Tagging a User carrying
 * `Department=finance` with `department=hr` replaces the first tag. Managed
 * policies and the other IAM resources compare keys case-sensitively, and
 * this store serves Roles and Users only.
 */
export class SimIamIdentityTags {
  private readonly tags = new Map<string, SimIamTag>();

  /**
   * The tags held, in the order they were first set.
   */
  get all(): readonly SimIamTag[] {
    return this.tags.values().toArray();
  }

  /**
   * Set tags, replacing any whose key is already held.
   *
   * The whole request is checked before anything changes, and IAM refuses all
   * of it if one tag is invalid or the result would carry more than 50.
   */
  set(tags: readonly SimIamTagInput[], entity: string): void {
    const checked = checkedTags(tags);
    const keys = new Set([...this.tags.keys(), ...checked.keys()]);

    if (keys.size > maxTags) {
      throw new SimIamLimitExceeded(
        `Cannot exceed quota for TagsPer${entity}: ${String(maxTags)}`,
      );
    }

    for (const [key, tag] of checked) {
      this.tags.set(key, tag);
    }
  }

  /**
   * Remove the tags with these keys. A key the store does not hold is passed
   * over, as IAM passes it over.
   */
  remove(keys: readonly string[]): void {
    if (keys.length > maxTags) {
      throw new SimIamInvalidInput(
        `1 validation error detected: Value at 'tagKeys' failed to satisfy constraint: Member must have length less than or equal to ${String(maxTags)}`,
      );
    }

    for (const key of keys) {
      this.tags.delete(key.toLowerCase());
    }
  }

  /**
   * The tags as condition context values under one prefix, such as
   * `aws:PrincipalTag/`.
   */
  conditionValues(prefix: string): Readonly<Record<string, string>> {
    return Object.fromEntries(
      this.all.map((tag) => [`${prefix}${tag.Key}`, tag.Value]),
    );
  }
}

/**
 * Check the tags one request sets, keyed by the lower-case key they replace.
 */
function checkedTags(
  tags: readonly SimIamTagInput[],
): ReadonlyMap<string, SimIamTag> {
  if (tags.length > maxTags) {
    throw new SimIamLimitExceeded(
      `A request may set at most ${String(maxTags)} tags`,
    );
  }

  const checked = new Map<string, SimIamTag>();

  for (const tag of tags) {
    const valid = checkedTag(tag);
    const key = valid.Key.toLowerCase();

    if (checked.has(key)) {
      throw new SimIamInvalidInput(
        "Duplicate tag keys found. Please note that Tag keys are case insensitive.",
      );
    }

    checked.set(key, valid);
  }

  return checked;
}

/**
 * Check one tag's key and value against what IAM accepts.
 */
function checkedTag(tag: SimIamTagInput): SimIamTag {
  const { Key: key = "", Value: value } = tag;

  if (
    value === undefined ||
    !keyPattern.test(key) ||
    !valuePattern.test(value)
  ) {
    throw new SimIamInvalidInput(
      `Tag ${key}=${String(value)} has a key or value outside what IAM accepts`,
    );
  }

  if (key.toLowerCase().startsWith("aws:")) {
    throw new SimIamInvalidInput(
      `Tag key ${key} uses the aws: prefix, which is reserved for AWS use`,
    );
  }

  return { Key: key, Value: value };
}

/**
 * A request's tags, as the input to a command that creates or tags an entity
 * carries them.
 */
export type SimIamTagsInput = readonly SimIamTagInput[] | undefined;

/**
 * The `Tags` member of an answer describing a Role or a User.
 *
 * IAM leaves the member out for an entity carrying no tags.
 */
export function simIamTagsMember(tags: SimIamIdentityTags): {
  readonly Tags?: readonly SimIamTag[];
} {
  const all = tags.all;

  return all.length === 0 ? {} : { Tags: all };
}

/**
 * Make the tags of a new Role or User from the tags its request carries.
 */
export function makeSimIamIdentityTags(
  tags: SimIamTagsInput,
  entity: "Role" | "User",
): SimIamIdentityTags {
  const identityTags = new SimIamIdentityTags();

  identityTags.set(tags ?? [], entity);

  return identityTags;
}
