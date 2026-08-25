/**
 * The AWS::Glue::Table properties this simulation has nothing to act on, and
 * why.
 *
 * A table here is a definition rather than a dataset, so anything describing
 * how data would be read back or written is recorded and left out.
 */
export const unsimulatedTableReasons: ReadonlyMap<string, string> = new Map([
  [
    "OpenTableFormatInput",
    "no Iceberg metadata is written, so an open format table is created as " +
      "an ordinary one",
  ],
]);

/**
 * The AWS::Glue::Table TableInput properties this simulation has nothing to
 * act on, and why.
 */
export const unsimulatedTableInputReasons: ReadonlyMap<string, string> =
  new Map([
    [
      "LastAccessTime",
      "nothing reads the table, so the last access time is whatever a caller " +
        "declared rather than something the simulation keeps",
    ],
    [
      "LastAnalyzedTime",
      "no statistics are gathered, so nothing analyses the table",
    ],
    [
      "TargetTable",
      "a table linking to another catalog's table is not simulated, so this " +
        "one holds only its own definition",
    ],
    [
      "ViewDefinition",
      "no SQL is parsed or run, so a view resolves to nothing",
    ],
    [
      "ViewExpandedText",
      "no SQL is parsed or run, so a view resolves to nothing",
    ],
    [
      "ViewOriginalText",
      "no SQL is parsed or run, so a view resolves to nothing",
    ],
  ]);

/**
 * The StorageDescriptor properties this simulation has nothing to act on, and
 * why.
 */
export const unsimulatedStorageDescriptorReasons: ReadonlyMap<string, string> =
  new Map([
    [
      "AdditionalLocations",
      "no object is read, so a table reads from none of its locations",
    ],
    [
      "SchemaReference",
      "the Schema Registry is not simulated, so a referenced schema resolves " +
        "to nothing",
    ],
    [
      "SkewedInfo",
      "no query plan is built, so nothing takes a skewed value into account",
    ],
    [
      "SortColumns",
      "no data is read, so nothing relies on the order rows are stored in",
    ],
    [
      "StoredAsSubDirectories",
      "no object is listed, so nothing walks into a partition's " +
        "subdirectories",
    ],
  ]);
