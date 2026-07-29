import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * An app client as sim Cognito reports it in a listing, which carries only
 * enough to describe it with.
 *
 * https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UserPoolClientDescription.html
 */
export interface SimCognitoUserPoolClientDescription {
  readonly ClientId?: string | undefined;
  readonly UserPoolId?: string | undefined;
  readonly ClientName?: string | undefined;
}

/**
 * Minimal structural sim Cognito ListUserPoolClients command.
 */
export interface SimListUserPoolClientsCommand {
  readonly input: SimListUserPoolClientsCommandInput;
}

export interface SimListUserPoolClientsCommandInput {
  readonly UserPoolId?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListUserPoolClientsCommandOutput {
  readonly UserPoolClients?:
    readonly SimCognitoUserPoolClientDescription[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}
