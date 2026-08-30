import type { SimS3VersioningConfiguration } from "../../bucket/versioning/sim-s3-bucket-versioning.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../error/sim-s3.error.js";

/**
 * Refuse a versioning configuration this simulator cannot carry out.
 *
 * Real S3 takes `Enabled` and `Suspended` for the status and nothing else, and
 * there is no request that takes a Bucket back to unversioned. MFA delete
 * takes `Enabled` and `Disabled`, and a value that is neither is refused here
 * rather than ignored, because a status S3 would have rejected reads back
 * looking configured. Asking for it enabled is refused too, since a Bucket
 * reporting a protection it does not enforce is the wrong answer to the
 * question a test is asking.
 */
export function validateSimS3VersioningConfiguration(
  configuration: SimS3VersioningConfiguration,
  bucketName: string,
): void {
  if (configuration.MFADelete === "Enabled") {
    throw new SimS3NotImplemented(
      `Simulated S3 does not enforce MFA delete, so it refuses to report it ` +
        `enabled on Bucket ${bucketName}.`,
    );
  }

  if (
    configuration.MFADelete !== undefined &&
    configuration.MFADelete !== "Disabled"
  ) {
    throw new SimS3InvalidArgument(
      `The MFA delete status ${configuration.MFADelete} is not one S3 ` +
        `accepts. It takes Enabled or Disabled.`,
    );
  }

  if (
    configuration.Status !== "Enabled" &&
    configuration.Status !== "Suspended"
  ) {
    throw new SimS3InvalidArgument(
      `The versioning status ${String(configuration.Status)} is not one S3 ` +
        `accepts. It takes Enabled or Suspended.`,
    );
  }
}
