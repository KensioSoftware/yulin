import { SimStatesTooManyTags } from "../error/sim-step-functions.error.js";
import {
  type SimStateMachineTag,
  type SimStatesTagInput,
  readSimStatesTags,
} from "./sim-state-machine-tag.js";

/**
 * Real Step Functions holds 50 tags on a resource.
 *
 * Tags AWS assigns itself are outside this, and a caller cannot assign one of
 * those, so every tag here counts towards it.
 */
const greatestTags = 50;

/**
 * The tags one simulated state machine holds.
 *
 * A key appears once. Tagging a key that is already there replaces its value,
 * which is what makes `TagResource` a way of changing a tag as well as adding
 * one.
 */
export class SimStateMachineTags {
  #tags: ReadonlyMap<string, SimStateMachineTag>;

  private constructor(tags: ReadonlyMap<string, SimStateMachineTag>) {
    this.#tags = tags;
  }

  /**
   * Read the tags a request carries, which may be none at all.
   */
  static fromInput(
    input: readonly SimStatesTagInput[] | undefined,
  ): SimStateMachineTags {
    const tags = new this(new Map());

    tags.apply(readSimStatesTags(input ?? []));

    return tags;
  }

  /**
   * Add tags a request carried, replacing the value of any key already held.
   *
   * The whole request is counted before anything is kept. A request Step
   * Functions would refuse leaves the tags exactly as they were.
   */
  apply(tags: readonly SimStateMachineTag[]): void {
    const applied = new Map(this.#tags);

    for (const tag of tags) {
      applied.set(tag.key, tag);
    }

    assertWithinLimit(applied.size);

    this.#tags = applied;
  }

  /**
   * Take the tags a request names off, leaving the rest.
   *
   * A key that is not there is not an error. `UntagResource` asks for a state
   * rather than for a change, and that state is a resource without that key.
   */
  remove(keys: readonly string[]): void {
    const left = new Map(this.#tags);

    for (const key of keys) {
      left.delete(key);
    }

    this.#tags = left;
  }

  /**
   * Every tag this state machine holds, ordered by key.
   *
   * Step Functions says nothing about the order it lists tags in. Ordering
   * them by key is one of the orders it allows, and it means a test reads the
   * same list twice.
   */
  ordered(): readonly SimStateMachineTag[] {
    return this.#tags
      .values()
      .toArray()
      .toSorted((one, other) => one.key.localeCompare(other.key));
  }
}

/**
 * Refuse a state machine holding more tags than Step Functions holds.
 */
function assertWithinLimit(size: number): void {
  if (size > greatestTags) {
    throw new SimStatesTooManyTags(
      `A Step Functions resource holds ${greatestTags.toString()} tags, and ` +
        `this request would leave it holding ${size.toString()}.`,
    );
  }
}
