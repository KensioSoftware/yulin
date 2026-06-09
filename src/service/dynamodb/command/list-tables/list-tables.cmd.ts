/**
 * Minimal structural sim DynamoDB ListTables command.
 */
export interface SimListTablesCommand {
  readonly input: SimListTablesCommandInput;
}

/**
 * Minimal structural sim DynamoDB ListTables input.
 */
export interface SimListTablesCommandInput {
  readonly ExclusiveStartTableName?: string | undefined;
  readonly Limit?: number | undefined;
}

/**
 * Minimal structural sim DynamoDB ListTables output.
 */
export interface SimListTablesCommandOutput {
  readonly TableNames?: readonly string[] | undefined;
  readonly LastEvaluatedTableName?: string | undefined;
  readonly $metadata: Record<string, unknown>;
}
