import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimCognitoUserType } from "./user.command.js";

/**
 * The ListUsers inputs this simulation reads, and the ones it refuses.
 *
 * This listing pages differently from the others: the page size is `Limit`
 * rather than `MaxResults`, and the continuation token is `PaginationToken`
 * rather than `NextToken`, as it is on real Cognito.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/cognito-identity-provider/command/ListUsersCommand/
 */
export interface SimListUsersCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly Limit?: number | undefined;
  readonly PaginationToken?: string | undefined;
  readonly Filter?: string | undefined;
  readonly AttributesToGet?: readonly string[] | undefined;
}

/**
 * Minimal structural sim Cognito ListUsers command.
 */
export interface SimListUsersCommand {
  readonly input: SimListUsersCommandInput;
}

export interface SimListUsersCommandOutput {
  readonly Users?: readonly SimCognitoUserType[] | undefined;
  readonly PaginationToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
