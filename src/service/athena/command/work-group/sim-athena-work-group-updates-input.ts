import type {
  SimAthenaResultConfigurationUpdates,
  SimAthenaWorkGroupConfigurationUpdates,
} from "../../workgroup/sim-athena-work-group-updates.js";
import {
  engineVersionFrom,
  resultEncryptionFrom,
  resultAclFrom,
} from "./sim-athena-work-group-input.js";
import type {
  SimAthenaResultConfigurationUpdatesInput,
  SimAthenaWorkGroupConfigurationUpdatesInput,
} from "./work-group.command.js";

/**
 * Read a `WorkGroupConfigurationUpdates` off an update request.
 *
 * Athena updates a workgroup field by field, and clearing a field takes its own
 * `Remove...` flag, so the removals travel alongside the values rather than
 * being applied here.
 */
export function workGroupConfigurationUpdatesFrom(
  input: SimAthenaWorkGroupConfigurationUpdatesInput,
): SimAthenaWorkGroupConfigurationUpdates {
  return {
    bytesScannedCutoffPerQuery: input.BytesScannedCutoffPerQuery,
    removeBytesScannedCutoffPerQuery: input.RemoveBytesScannedCutoffPerQuery,
    enforceWorkGroupConfiguration: input.EnforceWorkGroupConfiguration,
    publishCloudWatchMetricsEnabled: input.PublishCloudWatchMetricsEnabled,
    requesterPaysEnabled: input.RequesterPaysEnabled,
    engineVersion: engineVersionFrom(input.EngineVersion),
    resultConfigurationUpdates: resultUpdatesFrom(
      input.ResultConfigurationUpdates,
    ),
  };
}

function resultUpdatesFrom(
  input: SimAthenaResultConfigurationUpdatesInput | undefined,
): SimAthenaResultConfigurationUpdates | undefined {
  if (input === undefined) {
    return undefined;
  }

  return {
    outputLocation: input.OutputLocation,
    encryption: resultEncryptionFrom(input),
    acl: resultAclFrom(input),
    expectedBucketOwner: input.ExpectedBucketOwner,
    removeOutputLocation: input.RemoveOutputLocation,
    removeEncryptionConfiguration: input.RemoveEncryptionConfiguration,
    removeAclConfiguration: input.RemoveAclConfiguration,
    removeExpectedBucketOwner: input.RemoveExpectedBucketOwner,
  };
}
