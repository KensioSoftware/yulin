import type { SimAthenaResultConfiguration } from "../../workgroup/sim-athena-result-configuration.js";
import type { SimAthenaWorkGroupConfiguration } from "../../workgroup/sim-athena-work-group-configuration.js";
import type { SimAthenaWorkGroup } from "../../workgroup/sim-athena-work-group.js";
import type {
  SimAthenaDescribedWorkGroup,
  SimAthenaListedWorkGroup,
  SimAthenaResultConfigurationInput,
  SimAthenaWorkGroupConfigurationInput,
} from "./work-group.command.js";

/**
 * One workgroup as `GetWorkGroup` answers with it.
 */
export function describedWorkGroup(
  workGroup: SimAthenaWorkGroup,
): SimAthenaDescribedWorkGroup {
  return {
    Name: workGroup.name,
    State: workGroup.state,
    Description: workGroup.description,
    CreationTime: workGroup.createdAt,
    Configuration: describedConfiguration(workGroup.configuration),
  };
}

/**
 * One workgroup as `ListWorkGroups` answers with it.
 *
 * A listing carries a summary rather than the whole workgroup, so the
 * configuration is absent from it and only the engine version comes through.
 */
export function listedWorkGroup(
  workGroup: SimAthenaWorkGroup,
): SimAthenaListedWorkGroup {
  return {
    Name: workGroup.name,
    State: workGroup.state,
    Description: workGroup.description,
    CreationTime: workGroup.createdAt,
    EngineVersion: engineVersionOf(workGroup.configuration),
  };
}

function describedConfiguration(
  configuration: SimAthenaWorkGroupConfiguration,
): SimAthenaWorkGroupConfigurationInput {
  return {
    BytesScannedCutoffPerQuery: configuration.bytesScannedCutoffPerQuery,
    EnforceWorkGroupConfiguration: configuration.enforceWorkGroupConfiguration,
    PublishCloudWatchMetricsEnabled:
      configuration.publishCloudWatchMetricsEnabled,
    RequesterPaysEnabled: configuration.requesterPaysEnabled,
    ResultConfiguration: describedResultConfiguration(
      configuration.resultConfiguration,
    ),
    EngineVersion: engineVersionOf(configuration),
  };
}

function describedResultConfiguration(
  resultConfiguration: SimAthenaResultConfiguration | undefined,
): SimAthenaResultConfigurationInput | undefined {
  if (resultConfiguration === undefined) {
    return undefined;
  }

  const encryption = resultConfiguration.encryption;
  const acl = resultConfiguration.acl;

  return {
    OutputLocation: resultConfiguration.outputLocation,
    ExpectedBucketOwner: resultConfiguration.expectedBucketOwner,
    EncryptionConfiguration:
      encryption === undefined
        ? undefined
        : {
            EncryptionOption: encryption.encryptionOption,
            KmsKey: encryption.kmsKey,
          },
    AclConfiguration:
      acl === undefined ? undefined : { S3AclOption: acl.s3AclOption },
  };
}

function engineVersionOf(
  configuration: SimAthenaWorkGroupConfiguration,
): SimAthenaWorkGroupConfigurationInput["EngineVersion"] {
  const engineVersion = configuration.engineVersion;

  if (engineVersion === undefined) {
    return undefined;
  }

  return {
    SelectedEngineVersion: engineVersion.selectedEngineVersion,
    EffectiveEngineVersion: engineVersion.effectiveEngineVersion,
  };
}
