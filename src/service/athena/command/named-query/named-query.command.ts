import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * A named query, as a response carries it.
 */
export interface SimAthenaDescribedNamedQuery {
  readonly NamedQueryId?: string | undefined;
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly Database?: string | undefined;
  readonly QueryString?: string | undefined;
  readonly WorkGroup?: string | undefined;
}

/**
 * Minimal structural sim Athena CreateNamedQuery command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_CreateNamedQuery.html
 */
export interface SimCreateNamedQueryCommand {
  readonly input: SimCreateNamedQueryCommandInput;
}

export interface SimCreateNamedQueryCommandInput {
  readonly Name?: string | undefined;
  readonly Database?: string | undefined;
  readonly QueryString?: string | undefined;
  readonly Description?: string | undefined;
  readonly WorkGroup?: string | undefined;
  readonly ClientRequestToken?: string | undefined;
}

export interface SimCreateNamedQueryCommandOutput {
  readonly NamedQueryId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena GetNamedQuery command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_GetNamedQuery.html
 */
export interface SimGetNamedQueryCommand {
  readonly input: SimGetNamedQueryCommandInput;
}

export interface SimGetNamedQueryCommandInput {
  readonly NamedQueryId?: string | undefined;
}

export interface SimGetNamedQueryCommandOutput {
  readonly NamedQuery?: SimAthenaDescribedNamedQuery | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena BatchGetNamedQuery command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_BatchGetNamedQuery.html
 */
export interface SimBatchGetNamedQueryCommand {
  readonly input: SimBatchGetNamedQueryCommandInput;
}

export interface SimBatchGetNamedQueryCommandInput {
  readonly NamedQueryIds?: readonly string[] | undefined;
}

export interface SimBatchGetNamedQueryCommandOutput {
  readonly NamedQueries?: readonly SimAthenaDescribedNamedQuery[] | undefined;
  readonly UnprocessedNamedQueryIds?:
    | readonly SimAthenaUnprocessedNamedQueryId[]
    | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * One id a batch could not answer for, and why.
 */
export interface SimAthenaUnprocessedNamedQueryId {
  readonly NamedQueryId?: string | undefined;
  readonly ErrorCode?: string | undefined;
  readonly ErrorMessage?: string | undefined;
}

/**
 * Minimal structural sim Athena ListNamedQueries command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_ListNamedQueries.html
 */
export interface SimListNamedQueriesCommand {
  readonly input: SimListNamedQueriesCommandInput;
}

export interface SimListNamedQueriesCommandInput {
  readonly WorkGroup?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimListNamedQueriesCommandOutput {
  readonly NamedQueryIds?: readonly string[] | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena DeleteNamedQuery command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_DeleteNamedQuery.html
 */
export interface SimDeleteNamedQueryCommand {
  readonly input: SimDeleteNamedQueryCommandInput;
}

export interface SimDeleteNamedQueryCommandInput {
  readonly NamedQueryId?: string | undefined;
}

export interface SimDeleteNamedQueryCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
