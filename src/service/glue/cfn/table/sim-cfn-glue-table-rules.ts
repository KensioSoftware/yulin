import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";
import {
  unsimulatedTableInputReasons,
  unsimulatedTableReasons,
} from "./sim-cfn-glue-table-unsimulated-properties.js";

const readNames = new Set(["CatalogId", "DatabaseName", "TableInput"]);

const readInputNames = new Set([
  "Name",
  "Description",
  "Owner",
  "Retention",
  "TableType",
  "PartitionKeys",
  "StorageDescriptor",
  "Parameters",
]);

interface SimCfnGlueTableIgnoredProperties {
  readonly resource: SimCfnPropertyIgnorer;
  readonly names: readonly string[];
  readonly inputNames: readonly string[];
}

/**
 * Record every AWS::Glue::Table property the table is created without.
 */
export function simCfnGlueTableIgnored(
  properties: SimCfnGlueTableIgnoredProperties,
): void {
  const { resource } = properties;

  for (const name of properties.names) {
    if (!readNames.has(name)) {
      ignore(resource, name, "AWS::Glue::Table", unsimulatedTableReasons);
    }
  }

  for (const name of properties.inputNames) {
    if (!readInputNames.has(name)) {
      ignore(
        resource,
        name,
        "TableInput",
        unsimulatedTableInputReasons,
        `TableInput.${name}`,
      );
    }
  }
}

function ignore(
  resource: SimCfnPropertyIgnorer,
  name: string,
  owner: string,
  reasons: ReadonlyMap<string, string>,
  path = name,
): void {
  const reason = reasons.get(name);

  resource.ignoreProperty(
    path,
    reason === undefined
      ? `${path} is not a ${owner} property simulated Glue knows about, so ` +
          `the table is created without it`
      : `${path} is a real ${owner} property simulated Glue does not act ` +
          `on: ${reason}`,
  );
}
