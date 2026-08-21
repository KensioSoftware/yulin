import type { SimResponseMetadata } from "../../../aws/metadata/response-metadata.type.js";

/**
 * Minimal structural sim Personalize CreateSchema command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/CreateSchemaCommand/
 */
export interface SimCreateSchemaCommand {
  readonly input: SimCreateSchemaCommandInput;
}

export interface SimCreateSchemaCommandInput {
  readonly name?: string | undefined;
  readonly schema?: string | undefined;
  readonly domain?: string | undefined;
}

export interface SimCreateSchemaCommandOutput {
  readonly schemaArn?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * A schema as Describe and List report it.
 *
 * Personalize gives a schema no status of its own, unlike every other
 * resource here. There is nothing to provision, so a schema exists or it does
 * not.
 */
export interface SimPersonalizeSchemaDetail {
  readonly name?: string | undefined;
  readonly schemaArn?: string | undefined;
  readonly schema?: string | undefined;
  readonly creationDateTime?: Date | undefined;
  readonly lastUpdatedDateTime?: Date | undefined;
  readonly domain?: string | undefined;
}

/**
 * Minimal structural sim Personalize DescribeSchema command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DescribeSchemaCommand/
 */
export interface SimDescribeSchemaCommand {
  readonly input: SimDescribeSchemaCommandInput;
}

export interface SimDescribeSchemaCommandInput {
  readonly schemaArn?: string | undefined;
}

export interface SimDescribeSchemaCommandOutput {
  readonly schema?: SimPersonalizeSchemaDetail | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize ListSchemas command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/ListSchemasCommand/
 */
export interface SimListSchemasCommand {
  readonly input?: SimListSchemasCommandInput | undefined;
}

export interface SimListSchemasCommandInput {
  readonly nextToken?: string | undefined;
  readonly maxResults?: number | undefined;
}

export interface SimListSchemasCommandOutput {
  readonly schemas?: readonly SimPersonalizeSchemaDetail[] | undefined;
  readonly nextToken?: string | undefined;
  readonly $metadata: SimResponseMetadata;
}

/**
 * Minimal structural sim Personalize DeleteSchema command.
 *
 * https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/client/personalize/command/DeleteSchemaCommand/
 */
export interface SimDeleteSchemaCommand {
  readonly input: SimDeleteSchemaCommandInput;
}

export interface SimDeleteSchemaCommandInput {
  readonly schemaArn?: string | undefined;
}

export interface SimDeleteSchemaCommandOutput {
  readonly $metadata: SimResponseMetadata;
}
