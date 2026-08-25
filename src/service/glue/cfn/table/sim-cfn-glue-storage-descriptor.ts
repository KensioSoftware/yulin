import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimGlueStorageDescriptor } from "../../table/sim-glue-table-schema.js";
import { definedEntries } from "../../../../util/record/defined-entries.js";
import type { SimCfnGlueRecord } from "../sim-cfn-glue-record.js";
import { recordUnreadGlueProperties } from "../sim-cfn-glue-ignored.js";
import { SimCfnGlueColumns } from "./sim-cfn-glue-columns.js";
import { unsimulatedStorageDescriptorReasons } from "./sim-cfn-glue-table-unsimulated-properties.js";

const readNames = new Set([
  "Columns",
  "Location",
  "InputFormat",
  "OutputFormat",
  "Compressed",
  "NumberOfBuckets",
  "SerdeInfo",
  "BucketColumns",
  "Parameters",
]);

/**
 * Reads a table's StorageDescriptor out of a template.
 *
 * The columns keep the order they were declared in, which is the order a query
 * over a delimited or a positional format reads them by.
 */
export class SimCfnGlueStorageDescriptor {
  readonly #ignorer: SimCfnPropertyIgnorer;
  readonly #columns: SimCfnGlueColumns;

  constructor(ignorer: SimCfnPropertyIgnorer) {
    this.#ignorer = ignorer;
    this.#columns = new SimCfnGlueColumns(ignorer);
  }

  /** The column reader, which partition keys are read through too. */
  get columns(): SimCfnGlueColumns {
    return this.#columns;
  }

  /** Read the whole descriptor. */
  read(fields: SimCfnGlueRecord): SimGlueStorageDescriptor {
    this.#recordIgnored(fields);

    return definedEntries({
      Columns: fields.read("Columns", (value, path) =>
        this.#columns.list(fields.values, value, path),
      ),
      Location: fields.string("Location"),
      InputFormat: fields.string("InputFormat"),
      OutputFormat: fields.string("OutputFormat"),
      Compressed: fields.boolean("Compressed"),
      NumberOfBuckets: fields.number("NumberOfBuckets"),
      SerdeInfo: fields.read("SerdeInfo", (value, path) =>
        this.#columns.serdeInfo(fields.nested(value, path)),
      ),
      BucketColumns: fields.read("BucketColumns", (value, path) =>
        this.#bucketColumns(fields, value, path),
      ),
      Parameters: fields.parameters("Parameters"),
    });
  }

  #bucketColumns(
    fields: SimCfnGlueRecord,
    value: SimCfnTemplateValue,
    path: string,
  ): readonly string[] {
    return fields.values
      .list(value, path)
      .map((column, index) => fields.values.string(column, `${path}.${index}`));
  }

  #recordIgnored(fields: SimCfnGlueRecord): void {
    recordUnreadGlueProperties({
      ignorer: this.#ignorer,
      fields,
      known: readNames,
      owner: "StorageDescriptor",
      reasons: unsimulatedStorageDescriptorReasons,
    });
  }
}
