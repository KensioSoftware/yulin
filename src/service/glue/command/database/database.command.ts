import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * What a caller declares a database with.
 *
 * https://docs.aws.amazon.com/glue/latest/webapi/API_DatabaseInput.html
 */
export interface SimGlueDatabaseInputShape {
  readonly Name?: string | undefined;
  readonly Description?: string | undefined;
  readonly LocationUri?: string | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * What GetDatabase reports about one database.
 */
export interface SimGlueDatabaseDetail {
  readonly Name: string;
  readonly Description?: string | undefined;
  readonly LocationUri?: string | undefined;
  readonly Parameters: Readonly<Record<string, string>>;
  readonly CreateTime: Date;
  readonly CatalogId: string;
}

/**
 * Minimal structural sim Glue CreateDatabase command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/CreateDatabaseCommand/
 */
export interface SimCreateDatabaseCommand {
  readonly input: SimCreateDatabaseCommandInput;
}

export interface SimCreateDatabaseCommandInput {
  readonly CatalogId?: string | undefined;
  readonly DatabaseInput?: SimGlueDatabaseInputShape | undefined;
  readonly Tags?: Readonly<Record<string, string>> | undefined;
}

export interface SimCreateDatabaseCommandOutput {
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue GetDatabase command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/GetDatabaseCommand/
 */
export interface SimGetDatabaseCommand {
  readonly input: SimGetDatabaseCommandInput;
}

export interface SimGetDatabaseCommandInput {
  readonly CatalogId?: string | undefined;
  readonly Name?: string | undefined;
}

export interface SimGetDatabaseCommandOutput {
  readonly Database: SimGlueDatabaseDetail;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue GetDatabases command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/GetDatabasesCommand/
 */
export interface SimGetDatabasesCommand {
  readonly input: SimGetDatabasesCommandInput;
}

export interface SimGetDatabasesCommandInput {
  readonly CatalogId?: string | undefined;
}

export interface SimGetDatabasesCommandOutput {
  readonly DatabaseList: readonly SimGlueDatabaseDetail[];
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Glue DeleteDatabase command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/glue/command/DeleteDatabaseCommand/
 */
export interface SimDeleteDatabaseCommand {
  readonly input: SimDeleteDatabaseCommandInput;
}

export interface SimDeleteDatabaseCommandInput {
  readonly CatalogId?: string | undefined;
  readonly Name?: string | undefined;
}

export interface SimDeleteDatabaseCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
