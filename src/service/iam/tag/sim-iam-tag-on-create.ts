import {
  type SimIamConditions,
  simIamRequestTagConditions,
} from "./sim-iam-tag-conditions.js";

/**
 * One tag a create request carries, in the shape most services take it.
 */
export interface SimIamCreateTag {
  readonly Key?: string | undefined;
  readonly Value?: string | undefined;
}

/**
 * What IAM has to allow for a request that creates a resource and may tag it.
 */
export interface SimIamTagOnCreate {
  /**
   * The create action, then the service's tag action when the request
   * carries at least one tag.
   */
  readonly actions: readonly string[];

  /**
   * The tags as `aws:RequestTag/<key>` and their keys as `aws:TagKeys`. Both
   * actions see them.
   */
  readonly conditions: SimIamConditions;
}

/**
 * The actions and condition values for a create request that may carry tags.
 *
 * AWS authorizes tagging on create as a second action. A caller allowed to
 * create a resource but not to tag it is refused a request that tags it, and
 * an empty tag list asks for no tagging. The Service Authorization Reference
 * lists the tag action among the actions each of these operations
 * authorizes.
 */
export function simIamTagOnCreate(
  createAction: string,
  tagAction: string,
  tags: readonly SimIamCreateTag[] | undefined,
): SimIamTagOnCreate {
  const tagged = tags !== undefined && tags.length > 0;

  return {
    actions: tagged ? [createAction, tagAction] : [createAction],
    conditions: simIamRequestTagConditions(tags),
  };
}
