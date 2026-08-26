import type { SimAthenaProjection } from "./sim-athena-projection-column.js";
import {
  SimAthenaProjectionError,
  simAthenaProjectionLimit,
} from "./sim-athena-projection-error.js";

/** The values each projected column takes, once a query has been read. */
export type SimAthenaProjectedValues = ReadonlyMap<string, readonly string[]>;

/**
 * The S3 prefixes a table's projected partitions sit under.
 *
 * A `storage.location.template` says where each one goes and has to name every
 * projected column, since a template leaving one out sends two partitions to
 * the same prefix. A table with no template gets the Hive layout under its own
 * location, which is what Athena falls back to.
 */
export function simAthenaProjectedPrefixes(
  projection: SimAthenaProjection,
  values: SimAthenaProjectedValues,
  tableLocation: string | undefined,
): readonly string[] {
  const template = projection.locationTemplate;

  if (template === undefined) {
    return hivePrefixes(projection, values, tableLocation);
  }

  for (const column of projection.columns) {
    if (!template.includes(placeholder(column.name))) {
      throw new SimAthenaProjectionError(
        `storage.location.template names no ${placeholder(column.name)}, and ` +
          `every projected partition column has to appear in it`,
      );
    }
  }

  return combinations(projection, values).map((combination) =>
    withTrailingSlash(fill(template, combination)),
  );
}

function hivePrefixes(
  projection: SimAthenaProjection,
  values: SimAthenaProjectedValues,
  tableLocation: string | undefined,
): readonly string[] {
  if (tableLocation === undefined) {
    throw new SimAthenaProjectionError(
      `Partition projection is enabled and the table has neither a ` +
        `storage.location.template nor a location of its own`,
    );
  }

  const base = withTrailingSlash(tableLocation);

  return combinations(projection, values).map((combination) => {
    const segments = projection.columns.map(
      (column) => `${column.name}=${combination.get(column.name) ?? ""}`,
    );

    return `${base}${segments.join("/")}/`;
  });
}

function placeholder(name: string): string {
  return `\${${name}}`;
}

function fill(
  template: string,
  combination: ReadonlyMap<string, string>,
): string {
  let filled = template;

  for (const [name, value] of combination) {
    // A replacer function, because `$` in a projected value would be read
    // as a capture group reference by the string form.
    filled = filled.replaceAll(placeholder(name), () => value);
  }

  return filled;
}

function withTrailingSlash(location: string): string {
  return location.endsWith("/") ? location : `${location}/`;
}

/**
 * Every combination of one value from each projected column.
 *
 * A table projecting a region and a day has one partition per pair, which is
 * what makes a projection over several columns grow as fast as it does.
 */
function combinations(
  projection: SimAthenaProjection,
  values: SimAthenaProjectedValues,
): readonly ReadonlyMap<string, string>[] {
  let built: ReadonlyMap<string, string>[] = [new Map<string, string>()];

  for (const column of projection.columns) {
    const columnValues = values.get(column.name) ?? [];
    const grown: ReadonlyMap<string, string>[] = [];

    for (const partial of built) {
      for (const value of columnValues) {
        grown.push(new Map([...partial, [column.name, value]]));
      }
    }

    if (grown.length > simAthenaProjectionLimit) {
      throw new SimAthenaProjectionError(
        `The projected partition columns come to more than ` +
          `${String(simAthenaProjectionLimit)} partitions between them`,
      );
    }

    built = grown;
  }

  return built;
}
