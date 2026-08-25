import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";
import type { SimAthenaResultConfigurationInput } from "../work-group/work-group.command.js";

/**
 * The database and catalog a query runs against.
 */
export interface SimAthenaQueryExecutionContextInput {
  readonly Database?: string | undefined;
  readonly Catalog?: string | undefined;
}

/**
 * What one query scanned and how long it took.
 */
export interface SimAthenaQueryStatistics {
  readonly DataScannedInBytes?: number | undefined;
  readonly EngineExecutionTimeInMillis?: number | undefined;
  readonly TotalExecutionTimeInMillis?: number | undefined;
}

/**
 * Where a query has got to.
 */
export interface SimAthenaQueryStatus {
  readonly State?: string | undefined;
  readonly StateChangeReason?: string | undefined;
  readonly SubmissionDateTime?: Date | undefined;
  readonly CompletionDateTime?: Date | undefined;
}

/**
 * One query execution, as a response carries it.
 */
export interface SimAthenaDescribedQueryExecution {
  readonly QueryExecutionId?: string | undefined;
  readonly Query?: string | undefined;
  readonly StatementType?: string | undefined;
  readonly WorkGroup?: string | undefined;
  readonly QueryExecutionContext?:
    | SimAthenaQueryExecutionContextInput
    | undefined;
  readonly ResultConfiguration?: SimAthenaResultConfigurationInput | undefined;
  readonly Status?: SimAthenaQueryStatus | undefined;
  readonly Statistics?: SimAthenaQueryStatistics | undefined;
}

/**
 * One column of a result set.
 */
export interface SimAthenaColumnInfo {
  readonly Name?: string | undefined;
  readonly Type?: string | undefined;
}

/**
 * One row of a result set.
 */
export interface SimAthenaRow {
  readonly Data?: readonly { readonly VarCharValue?: string | undefined }[];
}

/**
 * The rows one page of results carries, and what they are called.
 */
export interface SimAthenaResultSet {
  readonly Rows?: readonly SimAthenaRow[] | undefined;
  readonly ResultSetMetadata?:
    | { readonly ColumnInfo?: readonly SimAthenaColumnInfo[] | undefined }
    | undefined;
}

/**
 * Minimal structural sim Athena StartQueryExecution command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_StartQueryExecution.html
 */
export interface SimStartQueryExecutionCommand {
  readonly input: SimStartQueryExecutionCommandInput;
}

export interface SimStartQueryExecutionCommandInput {
  readonly QueryString?: string | undefined;
  readonly WorkGroup?: string | undefined;
  readonly ClientRequestToken?: string | undefined;
  readonly QueryExecutionContext?:
    | SimAthenaQueryExecutionContextInput
    | undefined;
  readonly ResultConfiguration?: SimAthenaResultConfigurationInput | undefined;
}

export interface SimStartQueryExecutionCommandOutput {
  readonly QueryExecutionId?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena GetQueryExecution command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_GetQueryExecution.html
 */
export interface SimGetQueryExecutionCommand {
  readonly input: SimGetQueryExecutionCommandInput;
}

export interface SimGetQueryExecutionCommandInput {
  readonly QueryExecutionId?: string | undefined;
}

export interface SimGetQueryExecutionCommandOutput {
  readonly QueryExecution?: SimAthenaDescribedQueryExecution | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena GetQueryResults command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_GetQueryResults.html
 */
export interface SimGetQueryResultsCommand {
  readonly input: SimGetQueryResultsCommandInput;
}

export interface SimGetQueryResultsCommandInput {
  readonly QueryExecutionId?: string | undefined;
  readonly MaxResults?: number | undefined;
  readonly NextToken?: string | undefined;
}

export interface SimGetQueryResultsCommandOutput {
  readonly ResultSet?: SimAthenaResultSet | undefined;
  readonly NextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Athena StopQueryExecution command.
 *
 * https://docs.aws.amazon.com/athena/latest/APIReference/API_StopQueryExecution.html
 */
export interface SimStopQueryExecutionCommand {
  readonly input: SimStopQueryExecutionCommandInput;
}

export interface SimStopQueryExecutionCommandInput {
  readonly QueryExecutionId?: string | undefined;
}

export interface SimStopQueryExecutionCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
