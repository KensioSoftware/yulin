import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type {
  SimGlueColumn,
  SimGlueSerDeInfo,
} from "../../table/sim-glue-table-schema.js";
import { definedEntries } from "../../../../util/record/defined-entries.js";
import { recordUnreadGlueProperties } from "../sim-cfn-glue-ignored.js";
import { SimCfnGlueRecord } from "../sim-cfn-glue-record.js";
import type { SimCfnGlueValues } from "../sim-cfn-glue-values.js";

const readColumnNames = new Set(["Name", "Type", "Comment", "Parameters"]);
const readSerdeNames = new Set(["Name", "SerializationLibrary", "Parameters"]);

/**
 * Reads the column lists and the SerDe out of a template.
 *
 * Real Glue uses one `Column` shape for data columns and for partition keys,
 * so the same reader answers for both.
 */
export class SimCfnGlueColumns {
  readonly #ignorer: SimCfnPropertyIgnorer;

  constructor(ignorer: SimCfnPropertyIgnorer) {
    this.#ignorer = ignorer;
  }

  /** Read a list of columns, in the order they were declared. */
  list(
    values: SimCfnGlueValues,
    value: SimCfnTemplateValue,
    path: string,
  ): readonly SimGlueColumn[] {
    return values.list(value, path).map((column, index) => {
      const at = `${path}.${index}`;

      return this.#column(
        new SimCfnGlueRecord(values, values.record(column, at), at),
      );
    });
  }

  /** Read how rows are serialized and deserialized. */
  serdeInfo(fields: SimCfnGlueRecord): SimGlueSerDeInfo {
    this.#unread(fields, readSerdeNames, "SerdeInfo");

    return definedEntries({
      Name: fields.string("Name"),
      SerializationLibrary: fields.string("SerializationLibrary"),
      Parameters: fields.parameters("Parameters"),
    });
  }

  #column(fields: SimCfnGlueRecord): SimGlueColumn {
    this.#unread(fields, readColumnNames, "Column");

    return definedEntries({
      Name: fields.values.string(
        fields.required("Name"),
        `${fields.path}.Name`,
      ),
      Type: fields.string("Type"),
      Comment: fields.string("Comment"),
      Parameters: fields.parameters("Parameters"),
    });
  }

  #unread(
    fields: SimCfnGlueRecord,
    known: ReadonlySet<string>,
    owner: string,
  ): void {
    recordUnreadGlueProperties({
      ignorer: this.#ignorer,
      fields,
      known,
      owner,
    });
  }
}
