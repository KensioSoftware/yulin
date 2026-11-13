import type {
  SimIamTag,
  SimIamTagsInput,
} from "../../tag/sim-iam-identity-tags.js";

/**
 * Minimal structural sim IAM TagRole command.
 */
export interface SimTagRoleCommand {
  readonly input: {
    readonly RoleName?: string | undefined;
    readonly Tags?: SimIamTagsInput;
  };
}

/**
 * Minimal structural sim IAM UntagRole command.
 */
export interface SimUntagRoleCommand {
  readonly input: {
    readonly RoleName?: string | undefined;
    readonly TagKeys?: readonly string[] | undefined;
  };
}

/**
 * Minimal structural sim IAM ListRoleTags command.
 */
export interface SimListRoleTagsCommand {
  readonly input: {
    readonly RoleName?: string | undefined;
  };
}

/**
 * Minimal structural sim IAM TagUser command.
 */
export interface SimTagUserCommand {
  readonly input: {
    readonly UserName?: string | undefined;
    readonly Tags?: SimIamTagsInput;
  };
}

/**
 * Minimal structural sim IAM UntagUser command.
 */
export interface SimUntagUserCommand {
  readonly input: {
    readonly UserName?: string | undefined;
    readonly TagKeys?: readonly string[] | undefined;
  };
}

/**
 * Minimal structural sim IAM ListUserTags command.
 */
export interface SimListUserTagsCommand {
  readonly input: {
    readonly UserName?: string | undefined;
  };
}

/**
 * The answer to a command that sets or removes tags, which IAM leaves empty.
 */
export type SimIamTaggingCommandOutput = Record<string, never>;

/**
 * The answer to ListRoleTags or ListUserTags.
 *
 * Fifty tags at most fit on an entity, and IAM lists them in one page.
 */
export interface SimIamListTagsCommandOutput {
  readonly Tags: readonly SimIamTag[];
  readonly IsTruncated: false;
}
