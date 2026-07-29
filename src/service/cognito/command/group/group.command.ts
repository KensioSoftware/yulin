import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * A group as sim Cognito reports it.
 *
 * A group carries only the properties it was given, as real Cognito reports
 * only the ones a group has: a group created without a `Precedence` has no
 * `Precedence` in the response rather than a zero.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GroupType.html
 */
export interface SimCognitoGroupType {
  readonly GroupName?: string | undefined;
  readonly UserPoolId?: string | undefined;
  readonly Description?: string | undefined;
  readonly Precedence?: number | undefined;
  readonly RoleArn?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * What every group operation names: the pool, and the group in it.
 */
export interface SimCognitoGroupCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly GroupName?: string | undefined;
}

/**
 * The CreateGroup inputs, which are all simulated.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/CreateGroupCommand/
 */
export interface SimCreateGroupCommandInput extends SimCognitoGroupCommandInput {
  readonly Description?: string | undefined;
  readonly Precedence?: number | undefined;
  readonly RoleArn?: string | undefined;
}

/**
 * Minimal structural sim Cognito CreateGroup command.
 */
export interface SimCreateGroupCommand {
  readonly input: SimCreateGroupCommandInput;
}

export interface SimCreateGroupCommandOutput {
  readonly Group?: SimCognitoGroupType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito GetGroup command.
 */
export interface SimGetGroupCommand {
  readonly input: SimCognitoGroupCommandInput;
}

export interface SimGetGroupCommandOutput {
  readonly Group?: SimCognitoGroupType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * The UpdateGroup inputs, which are the same three properties `CreateGroup`
 * takes. The group's name identifies it and cannot be changed.
 */
export type SimUpdateGroupCommandInput = SimCreateGroupCommandInput;

/**
 * Minimal structural sim Cognito UpdateGroup command.
 */
export interface SimUpdateGroupCommand {
  readonly input: SimUpdateGroupCommandInput;
}

export interface SimUpdateGroupCommandOutput {
  readonly Group?: SimCognitoGroupType | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Cognito DeleteGroup command.
 */
export interface SimDeleteGroupCommand {
  readonly input: SimCognitoGroupCommandInput;
}

export interface SimDeleteGroupCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * The ListGroups inputs this simulation reads.
 *
 * This listing pages by `Limit` and `NextToken`, as the group listings do.
 */
export interface SimListGroupsCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Limit?: number | undefined;
  readonly NextToken?: string | undefined;
}

/**
 * Minimal structural sim Cognito ListGroups command.
 */
export interface SimListGroupsCommand {
  readonly input: SimListGroupsCommandInput;
}

export interface SimListGroupsCommandOutput {
  readonly Groups?: readonly SimCognitoGroupType[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
