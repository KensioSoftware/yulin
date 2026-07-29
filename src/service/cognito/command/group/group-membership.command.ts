import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoUserType } from "../user/user.command.js";
import type { SimCognitoGroupType } from "./group.command.js";

/**
 * What a membership operation names: the pool, the user and the group.
 */
export interface SimCognitoGroupMembershipCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
  readonly GroupName?: string | undefined;
}

/**
 * Minimal structural sim Cognito AdminAddUserToGroup command.
 */
export interface SimAdminAddUserToGroupCommand {
  readonly input: SimCognitoGroupMembershipCommandInput;
}

export interface SimAdminAddUserToGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito AdminRemoveUserFromGroup command.
 */
export interface SimAdminRemoveUserFromGroupCommand {
  readonly input: SimCognitoGroupMembershipCommandInput;
}

export interface SimAdminRemoveUserFromGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The AdminListGroupsForUser inputs this simulation reads.
 */
export interface SimAdminListGroupsForUserCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Username?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito AdminListGroupsForUser command.
 */
export interface SimAdminListGroupsForUserCommand {
  readonly input: SimAdminListGroupsForUserCommandInput;
}

export interface SimAdminListGroupsForUserCommandOutput {
  readonly Groups?: readonly SimCognitoGroupType[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The ListUsersInGroup inputs this simulation reads.
 */
export interface SimListUsersInGroupCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly GroupName?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito ListUsersInGroup command.
 */
export interface SimListUsersInGroupCommand {
  readonly input: SimListUsersInGroupCommandInput;
}

export interface SimListUsersInGroupCommandOutput {
  readonly Users?: readonly SimCognitoUserType[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
