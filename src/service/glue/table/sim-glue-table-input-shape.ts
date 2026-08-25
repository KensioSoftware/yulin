import { SimGlueInvalidInputException } from "../error/sim-glue.error.js";
import type {
  SimGlueColumn,
  SimGlueSerDeInfo,
  SimGlueStorageDescriptor,
} from "./sim-glue-table-schema.js";

/**
 * A column as a caller declares one.
 *
 * The name is required on real Glue and optional in the SDK's own types, so
 * the shape a Command accepts follows the SDK and the check happens here.
 */
export interface SimGlueColumnInput {
  readonly Name?: string | undefined;
  readonly Type?: string | undefined;
  readonly Comment?: string | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/** A storage descriptor as a caller declares one. */
export interface SimGlueStorageDescriptorInput {
  readonly Columns?: readonly SimGlueColumnInput[] | undefined;
  readonly Location?: string | undefined;
  readonly InputFormat?: string | undefined;
  readonly OutputFormat?: string | undefined;
  readonly Compressed?: boolean | undefined;
  readonly NumberOfBuckets?: number | undefined;
  readonly SerdeInfo?: SimGlueSerDeInfo | undefined;
  readonly BucketColumns?: readonly string[] | undefined;
  readonly Parameters?: Readonly<Record<string, string>> | undefined;
}

/**
 * Read a declared column list, refusing one without a name.
 */
export function requiredSimGlueColumns(
  label: string,
  columns: readonly SimGlueColumnInput[] | undefined,
): readonly SimGlueColumn[] | undefined {
  return columns?.map((column, index) => {
    if (column.Name === undefined || column.Name === "") {
      throw new SimGlueInvalidInputException(
        `${label}.${index}.Name is required`,
      );
    }

    return { ...column, Name: column.Name };
  });
}

/**
 * Read a declared storage descriptor, refusing a column without a name.
 */
export function requiredSimGlueStorageDescriptor(
  label: string,
  descriptor: SimGlueStorageDescriptorInput | undefined,
): SimGlueStorageDescriptor | undefined {
  if (descriptor === undefined) {
    return undefined;
  }

  return {
    ...descriptor,
    Columns: requiredSimGlueColumns(`${label}.Columns`, descriptor.Columns),
  };
}
