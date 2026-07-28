import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * A user pool as sim Cognito reports it in a listing, which carries less than
 * a described pool does.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolDescriptionType.html
 */
export interface SimCognitoUserPoolDescriptionType {
  readonly Id?: string | undefined;
  readonly Name?: string | undefined;
  readonly CreationDate?: Date | undefined;
  readonly LastModifiedDate?: Date | undefined;
}

/**
 * Minimal structural sim Cognito ListUserPools command.
 */
export interface SimListUserPoolsCommand {
  readonly input: SimListUserPoolsCommandInput;
}

export interface SimListUserPoolsCommandInput {
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListUserPoolsCommandOutput {
  readonly UserPools?: readonly SimCognitoUserPoolDescriptionType[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
