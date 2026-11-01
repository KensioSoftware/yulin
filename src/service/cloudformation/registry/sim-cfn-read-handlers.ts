import snapshot from "./sim-cfn-read-handlers.json" with { type: "json" };
import { SimCfnReadHandler } from "./sim-cfn-read-handler.js";

interface SimCfnReadHandlerRecord {
  readonly arn: string;
  readonly actions: readonly string[];
  readonly anyResourceActions: readonly string[];
}

const records: ReadonlyMap<string, SimCfnReadHandlerRecord> = new Map(
  Object.entries(snapshot.types),
);

/**
 * The read handler of each CloudFormation Resource type, from the snapshot
 * `scripts/mts/write-cfn-read-handlers.mts` writes.
 *
 * A type the snapshot leaves out has no read handler sim CloudFormation can
 * authorize. Either the registry publishes none for it, or none of its
 * permissions is decided on a resource type named after it.
 */
export function simCfnReadHandler(
  resourceType: string,
): SimCfnReadHandler | undefined {
  const record = records.get(resourceType);

  if (record === undefined) {
    return undefined;
  }

  return new SimCfnReadHandler({
    resourceType,
    arnFormat: record.arn,
    actions: record.actions,
    anyResourceActions: record.anyResourceActions,
  });
}
