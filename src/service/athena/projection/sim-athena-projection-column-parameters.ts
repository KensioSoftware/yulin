import type {
  SimAthenaProjectionColumn,
  SimAthenaProjectionType,
} from "./sim-athena-projection-column.js";
import { SimAthenaProjectionError } from "./sim-athena-projection-error.js";

const projectionTypes = new Set<string>([
  "enum",
  "integer",
  "date",
  "injected",
]);

/** Read how one partition column is projected. */
export function simAthenaProjectionColumnOf(
  name: string,
  parameters: Readonly<Record<string, string>>,
): SimAthenaProjectionColumn {
  const declared = read(parameters, name, "type")?.toLowerCase();

  if (declared === undefined) {
    throw new SimAthenaProjectionError(
      `Partition projection is enabled and partition column ${name} has no ` +
        `projection.${name}.type`,
    );
  }

  if (!projectionTypes.has(declared)) {
    throw new SimAthenaProjectionError(
      `Partition column ${name} declares projection type ${declared}, and ` +
        `Athena projects enum, integer, date and injected`,
    );
  }

  return {
    name,
    type: declared as SimAthenaProjectionType,
    values: splitValues(read(parameters, name, "values")),
    range: read(parameters, name, "range"),
    format: read(parameters, name, "format"),
    interval: wholeNumber(name, "interval", read(parameters, name, "interval")),
    intervalUnit: read(parameters, name, "interval.unit")?.toUpperCase(),
    digits: wholeNumber(name, "digits", read(parameters, name, "digits")),
  };
}

function read(
  parameters: Readonly<Record<string, string>>,
  name: string,
  suffix: string,
): string | undefined {
  return parameters[`projection.${name}.${suffix}`];
}

function splitValues(
  values: string | undefined,
): readonly string[] | undefined {
  return values
    ?.split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function wholeNumber(
  name: string,
  suffix: string,
  value: string | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value.trim());

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new SimAthenaProjectionError(
      `Partition column ${name} has projection.${name}.${suffix} of ` +
        `${value}, and it takes a whole number of 1 or more`,
    );
  }

  return parsed;
}
