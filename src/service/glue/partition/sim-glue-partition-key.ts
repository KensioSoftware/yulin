/**
 * The key one partition is held under within its table.
 *
 * A partition is identified by its values in the order the table's
 * `PartitionKeys` declares them, so the values are the whole of the key. They
 * are joined as JSON rather than with a separator character, since a value may
 * hold any character a separator could use: joining `["a", "b"]` and `["a/b"]`
 * on a slash gives one key for two different partitions.
 */
export function simGluePartitionKey(values: readonly string[]): string {
  return JSON.stringify(values);
}
