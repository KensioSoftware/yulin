/**
 * One column of a table, or one partition key.
 *
 * Real Glue uses the same `Column` shape for both, which is why a partition
 * key carries a type and a comment the way an ordinary column does.
 */
export interface SimGlueColumn {
  readonly Name: string;
  readonly Type?: string | undefined;
  readonly Comment?: string | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * How rows are serialized and deserialized.
 *
 * `SerializationLibrary` is the Java class name of the SerDe, which is how a
 * table says whether it holds JSON, Parquet, or something else.
 */
export interface SimGlueSerDeInfo {
  readonly Name?: string | undefined;
  readonly SerializationLibrary?: string | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * Where a table's data lives and how it is read.
 *
 * The columns here are the data columns. Partition keys sit on the table
 * rather than in here, and real Glue keeps them apart the same way.
 */
export interface SimGlueStorageDescriptor {
  readonly Columns?: readonly SimGlueColumn[] | undefined;
  readonly Location?: string | undefined;
  readonly InputFormat?: string | undefined;
  readonly OutputFormat?: string | undefined;
  readonly Compressed?: boolean | undefined;
  readonly NumberOfBuckets?: number | undefined;
  readonly SerdeInfo?: SimGlueSerDeInfo | undefined;
  readonly BucketColumns?: readonly string[] | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/** What a table is created with, beyond its name and its database. */
export interface SimGlueTableInput {
  readonly description?: string | undefined;
  readonly owner?: string | undefined;
  readonly retention?: number | undefined;
  readonly tableType?: string | undefined;
  readonly partitionKeys?: readonly SimGlueColumn[] | undefined;
  readonly storageDescriptor?: SimGlueStorageDescriptor | undefined;
  readonly parameters?: Readonly<Record<string, string>> | undefined;
}
