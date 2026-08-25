import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimGlueTableInput } from "../../table/sim-glue-table-schema.js";
import type { SimCfnGlueRecord } from "../sim-cfn-glue-record.js";
import { SimCfnGlueStorageDescriptor } from "./sim-cfn-glue-storage-descriptor.js";

/**
 * Reads a TableInput into what the table is created with.
 *
 * `Parameters` is read here rather than recorded as ignored, because Athena
 * partition projection lives entirely in it.
 */
export class SimCfnGlueTableInputReader {
  readonly #storage: SimCfnGlueStorageDescriptor;

  constructor(ignorer: SimCfnPropertyIgnorer) {
    this.#storage = new SimCfnGlueStorageDescriptor(ignorer);
  }

  /** Read the whole input. */
  read(fields: SimCfnGlueRecord): SimGlueTableInput {
    return {
      description: fields.string("Description"),
      owner: fields.string("Owner"),
      retention: fields.number("Retention"),
      tableType: fields.string("TableType"),
      partitionKeys: fields.read("PartitionKeys", (value, path) =>
        this.#storage.columns.list(fields.values, value, path),
      ),
      storageDescriptor: fields.read("StorageDescriptor", (value, path) =>
        this.#storage.read(fields.nested(value, path)),
      ),
      parameters: fields.parameters("Parameters"),
    };
  }
}
