import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";

/**
 * The deployed and new halves of one Resource an update changes.
 */
export interface SimCfnStackResourceChange {
  readonly current: SimCfnResource;
  readonly updated: SimCfnResource;
}

/**
 * The deployed and new halves of each of the given logical IDs.
 */
export function simCfnStackResourceChangePairs(
  current: ReadonlyMap<string, SimCfnResource>,
  updated: ReadonlyMap<string, SimCfnResource>,
  logicalIds: ReadonlySet<string>,
): readonly SimCfnStackResourceChange[] {
  return logicalIds
    .values()
    .map((logicalId) => {
      const currentResource = current.get(logicalId);
      const updatedResource = updated.get(logicalId);

      /* v8 ignore next 5 -- defensive: a changed logical ID is one both maps
         hold */
      if (currentResource === undefined || updatedResource === undefined) {
        throw new Error(
          `CloudFormation change ${logicalId} is missing one of its Resource definitions`,
        );
      }

      return { current: currentResource, updated: updatedResource };
    })
    .toArray();
}
