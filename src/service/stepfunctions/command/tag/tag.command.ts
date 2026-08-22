import type {
  SimStatesTag,
  SimStatesTagInput,
} from "../../machine/sim-state-machine-tag.js";

/**
 * Minimal structural sim Step Functions TagResource input.
 *
 * The resource is named by its ARN, which is how all three tag commands name
 * one.
 */
export interface SimTagResourceCommandInput {
  readonly resourceArn?: string;
  readonly tags?: readonly SimStatesTagInput[];
}

export interface SimTagResourceCommand {
  readonly input: SimTagResourceCommandInput;
}

/**
 * Real Step Functions answers with an empty body, so `ListTagsForResource` is
 * the only way to see what a tag request did.
 */
export type SimTagResourceCommandOutput = Record<string, never>;

/**
 * Minimal structural sim Step Functions UntagResource input.
 */
export interface SimUntagResourceCommandInput {
  readonly resourceArn?: string;
  readonly tagKeys?: readonly string[];
}

export interface SimUntagResourceCommand {
  readonly input: SimUntagResourceCommandInput;
}

export type SimUntagResourceCommandOutput = Record<string, never>;

/**
 * Minimal structural sim Step Functions ListTagsForResource input.
 *
 * There is no page to ask for. Real Step Functions answers with every tag a
 * resource holds, and its API has no paging on this operation.
 */
export interface SimListTagsForResourceCommandInput {
  readonly resourceArn?: string;
}

export interface SimListTagsForResourceCommand {
  readonly input: SimListTagsForResourceCommandInput;
}

export interface SimListTagsForResourceCommandOutput {
  readonly tags: readonly SimStatesTag[];
}
