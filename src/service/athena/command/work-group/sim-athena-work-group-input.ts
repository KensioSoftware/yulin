import { SimAthenaInvalidRequestException } from "../../error/sim-athena.error.js";
import { SimAthenaWorkGroupConfiguration } from "../../workgroup/sim-athena-work-group-configuration.js";
import type { SimAthenaEngineVersion } from "../../workgroup/sim-athena-work-group-configuration.js";
import { SimAthenaResultConfiguration } from "../../workgroup/sim-athena-result-configuration.js";
import type {
  SimAthenaResultAcl,
  SimAthenaResultEncryption,
} from "../../workgroup/sim-athena-result-configuration.js";
import type { SimAthenaWorkGroupState } from "../../workgroup/sim-athena-work-group.js";
import type {
  SimAthenaEngineVersionInput,
  SimAthenaResultConfigurationInput,
  SimAthenaWorkGroupConfigurationInput,
} from "./work-group.command.js";

/**
 * Read a `WorkGroupConfiguration` off a request.
 */
export function workGroupConfigurationFrom(
  input: SimAthenaWorkGroupConfigurationInput | undefined,
): SimAthenaWorkGroupConfiguration {
  if (input === undefined) {
    return new SimAthenaWorkGroupConfiguration();
  }

  return new SimAthenaWorkGroupConfiguration({
    bytesScannedCutoffPerQuery: bytesScannedCutoffFrom(
      input.BytesScannedCutoffPerQuery,
    ),
    enforceWorkGroupConfiguration: input.EnforceWorkGroupConfiguration,
    publishCloudWatchMetricsEnabled: input.PublishCloudWatchMetricsEnabled,
    requesterPaysEnabled: input.RequesterPaysEnabled,
    resultConfiguration: resultConfigurationFrom(input.ResultConfiguration),
    engineVersion: engineVersionFrom(input.EngineVersion),
  });
}

/**
 * Read the workgroup state a request asks for.
 */
export function workGroupStateFrom(
  value: string | undefined,
): SimAthenaWorkGroupState | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "ENABLED" && value !== "DISABLED") {
    throw new SimAthenaInvalidRequestException(
      `State '${value}' is not valid. A workgroup is ENABLED or DISABLED.`,
    );
  }

  return value;
}

/**
 * Read the result encryption a request or an update carries.
 */
export function resultEncryptionFrom(
  input: SimAthenaResultConfigurationInput,
): SimAthenaResultEncryption | undefined {
  const encryption = input.EncryptionConfiguration;

  if (encryption === undefined) {
    return undefined;
  }

  return {
    encryptionOption: encryption.EncryptionOption,
    kmsKey: encryption.KmsKey,
  };
}

/**
 * Read the result ACL a request or an update carries.
 */
export function resultAclFrom(
  input: SimAthenaResultConfigurationInput,
): SimAthenaResultAcl | undefined {
  const acl = input.AclConfiguration;

  return acl === undefined ? undefined : { s3AclOption: acl.S3AclOption };
}

/**
 * Read the engine version a request or an update carries.
 */
export function engineVersionFrom(
  input: SimAthenaEngineVersionInput | undefined,
): SimAthenaEngineVersion | undefined {
  if (input === undefined) {
    return undefined;
  }

  return {
    selectedEngineVersion: input.SelectedEngineVersion,
    effectiveEngineVersion:
      input.EffectiveEngineVersion ?? input.SelectedEngineVersion,
  };
}

/**
 * Read the bytes-scanned cutoff a request asks for.
 *
 * Real Athena refuses anything below 10MB. Any positive whole number is taken
 * here, so a test can put the cutoff wherever the query it is exercising
 * needs it. The docs page lists the divergence.
 */
function bytesScannedCutoffFrom(value: number | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new SimAthenaInvalidRequestException(
      `BytesScannedCutoffPerQuery ${String(value)} is not valid. The cutoff ` +
        `is a whole number of bytes, and at least 1.`,
    );
  }

  return value;
}

function resultConfigurationFrom(
  input: SimAthenaResultConfigurationInput | undefined,
): SimAthenaResultConfiguration | undefined {
  if (input === undefined) {
    return undefined;
  }

  const configuration = new SimAthenaResultConfiguration({
    outputLocation: input.OutputLocation,
    encryption: resultEncryptionFrom(input),
    acl: resultAclFrom(input),
    expectedBucketOwner: input.ExpectedBucketOwner,
  });

  return configuration.isEmpty ? undefined : configuration;
}
