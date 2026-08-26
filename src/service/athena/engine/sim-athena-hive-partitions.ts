/**
 * The partition values one object key carries, Hive style.
 *
 * `cloudfront/day=2026-08-01/part-0.json` gives a `day` of `2026-08-01`. This
 * is what a table laid out under its own location without a
 * `storage.location.template` looks like, and it is the only place a partition
 * column's value is written for a table nothing projects.
 *
 * Only the directories count. The last segment is the object's own name, and a
 * file called `a=b.json` is a file. A directory is read whatever it holds, so a
 * partition on `version=1.2` reads as `1.2`.
 */
export function simAthenaHivePartitionValues(
  key: string,
): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  const directories = key.split("/").slice(0, -1);

  for (const segment of directories) {
    const equals = segment.indexOf("=");

    if (equals > 0) {
      values[segment.slice(0, equals)] = decodeSegment(
        segment.slice(equals + 1),
      );
    }
  }

  return values;
}

/**
 * One partition value, with any percent encoding taken back off.
 *
 * Hive writes a value carrying a slash or a space percent encoded into the key
 * path, and the value a query compares against is the decoded one.
 */
function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
