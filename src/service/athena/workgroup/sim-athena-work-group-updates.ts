import type { SimAthenaEngineVersion } from "./sim-athena-work-group-configuration.js";
import type {
  SimAthenaResultAcl,
  SimAthenaResultEncryption,
} from "./sim-athena-result-configuration.js";

/**
 * What one `ResultConfigurationUpdates` asks for.
 *
 * Each field has a removal flag of its own, because Athena merges an update
 * rather than replacing what it finds, and clearing a field has to be said
 * rather than implied by leaving it out.
 */
export interface SimAthenaResultConfigurationUpdates {
  readonly outputLocation?: string | undefined;
  readonly encryption?: SimAthenaResultEncryption | undefined;
  readonly acl?: SimAthenaResultAcl | undefined;
  readonly expectedBucketOwner?: string | undefined;
  readonly removeOutputLocation?: boolean | undefined;
  readonly removeEncryptionConfiguration?: boolean | undefined;
  readonly removeAclConfiguration?: boolean | undefined;
  readonly removeExpectedBucketOwner?: boolean | undefined;
}

/**
 * What one `WorkGroupConfigurationUpdates` asks for.
 */
export interface SimAthenaWorkGroupConfigurationUpdates {
  readonly bytesScannedCutoffPerQuery?: number | undefined;
  readonly removeBytesScannedCutoffPerQuery?: boolean | undefined;
  readonly enforceWorkGroupConfiguration?: boolean | undefined;
  readonly publishCloudWatchMetricsEnabled?: boolean | undefined;
  readonly requesterPaysEnabled?: boolean | undefined;
  readonly resultConfigurationUpdates?:
    | SimAthenaResultConfigurationUpdates
    | undefined;
  readonly engineVersion?: SimAthenaEngineVersion | undefined;
}
