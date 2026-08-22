import {
  personalizeDatasetGroupResourceType,
  personalizeDatasetResourceType,
  personalizeEventTrackerResourceType,
  personalizeSchemaResourceType,
  personalizeSolutionResourceType,
} from "../../../../personalize/cfn/sim-cfn-personalize-resource-types.js";
import { SimPersonalizeDatasetGroup } from "../../../../personalize/resource/sim-personalize-dataset-group.js";
import type { SimPersonalizeResource } from "../../../../personalize/resource/sim-personalize-resource.js";
import { SimPersonalizeDataset } from "../../../../personalize/resource/sim-personalize-dataset.js";
import { SimPersonalizeEventTracker } from "../../../../personalize/resource/sim-personalize-event-tracker.js";
import { SimPersonalizeSchema } from "../../../../personalize/resource/sim-personalize-schema.js";
import { SimPersonalizeSolution } from "../../../../personalize/resource/sim-personalize-solution.js";
import type {
  SimCfnResourceValueAdapterProperties,
  SimCfnServiceValueAdapter,
} from "../sim-cfn-resource-value-adapter.js";
import { SimPersonalizeResourceCfn } from "./sim-personalize-resource-cfn.js";

/**
 * The CloudFormation-facing value adapter for a simulated Personalize Resource.
 */
export function personalizeValueAdapter(
  properties: SimCfnResourceValueAdapterProperties,
): SimCfnServiceValueAdapter {
  const { type, simResource } = properties;

  if (
    type === personalizeDatasetGroupResourceType &&
    simResource instanceof SimPersonalizeDatasetGroup
  ) {
    return adapter(type, simResource, [["DatasetGroupArn", simResource.arn]]);
  }

  if (
    type === personalizeSchemaResourceType &&
    simResource instanceof SimPersonalizeSchema
  ) {
    return adapter(type, simResource, [["SchemaArn", simResource.arn]]);
  }

  if (
    type === personalizeDatasetResourceType &&
    simResource instanceof SimPersonalizeDataset
  ) {
    return adapter(type, simResource, [["DatasetArn", simResource.arn]]);
  }

  if (
    type === personalizeSolutionResourceType &&
    simResource instanceof SimPersonalizeSolution
  ) {
    return adapter(type, simResource, [["SolutionArn", simResource.arn]]);
  }

  if (
    type === personalizeEventTrackerResourceType &&
    simResource instanceof SimPersonalizeEventTracker
  ) {
    return adapter(type, simResource, [
      ["EventTrackerArn", simResource.arn],
      ["TrackingId", simResource.trackingId],
    ]);
  }

  return undefined;
}

function adapter(
  resourceType: string,
  resource: SimPersonalizeResource,
  attributes: readonly (readonly [string, string])[],
): SimPersonalizeResourceCfn {
  return new SimPersonalizeResourceCfn({
    resource,
    resourceType,
    attributes: new Map(attributes),
  });
}
