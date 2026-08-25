import type {
  SimAthenaResultConfigurationInput,
  SimAthenaWorkGroupConfigurationInput,
} from "../../command/work-group/work-group.command.js";
import type { SimCfnAthenaProperties } from "../sim-cfn-athena-property-values.js";

/**
 * Read a template's `WorkGroupConfiguration` into the shape CreateWorkGroup
 * takes.
 *
 * The settings this simulation has no answer for are left out here and
 * recorded by the property rules, so a template carrying one still deploys its
 * workgroup.
 */
export function workGroupConfigurationProperties(
  read: SimCfnAthenaProperties,
): SimAthenaWorkGroupConfigurationInput {
  const engineVersion = read.nested("EngineVersion");

  return {
    BytesScannedCutoffPerQuery: read.number("BytesScannedCutoffPerQuery"),
    EnforceWorkGroupConfiguration: read.boolean(
      "EnforceWorkGroupConfiguration",
    ),
    PublishCloudWatchMetricsEnabled: read.boolean(
      "PublishCloudWatchMetricsEnabled",
    ),
    RequesterPaysEnabled: read.boolean("RequesterPaysEnabled"),
    ResultConfiguration: resultConfigurationProperties(read),
    EngineVersion:
      engineVersion === undefined
        ? undefined
        : {
            SelectedEngineVersion: engineVersion.string(
              "SelectedEngineVersion",
            ),
            EffectiveEngineVersion: engineVersion.string(
              "EffectiveEngineVersion",
            ),
          },
  };
}

function resultConfigurationProperties(
  read: SimCfnAthenaProperties,
): SimAthenaResultConfigurationInput | undefined {
  const results = read.nested("ResultConfiguration");

  if (results === undefined) {
    return undefined;
  }

  const encryption = results.nested("EncryptionConfiguration");
  const acl = results.nested("AclConfiguration");

  return {
    OutputLocation: results.string("OutputLocation"),
    ExpectedBucketOwner: results.string("ExpectedBucketOwner"),
    EncryptionConfiguration:
      encryption === undefined
        ? undefined
        : {
            EncryptionOption: encryption.string("EncryptionOption"),
            KmsKey: encryption.string("KmsKey"),
          },
    AclConfiguration:
      acl === undefined
        ? undefined
        : { S3AclOption: acl.string("S3AclOption") },
  };
}
