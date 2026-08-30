import type { SimS3VersioningConfiguration } from "../../bucket/versioning/sim-s3-bucket-versioning.js";
import {
  SimS3InvalidArgument,
  SimS3NotImplemented,
} from "../../error/sim-s3.error.js";

/**
 * Refuse a versioning configuration this simulator cannot carry out.
 *
 * Real S3 takes `Enabled` and `Suspended` and nothing else, and there is no
 * request that takes a Bucket back to unversioned. MFA delete is refused
 * rather than accepted quietly, because a Bucket that reported it on and did
 * not enforce it would be the wrong answer to the question a test asks.
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
    configuration.Status !== "Enabled" &&
    configuration.Status !== "Suspended"
  ) {
    throw new SimS3InvalidArgument(
      `The versioning status ${String(configuration.Status)} is not one S3 ` +
        `accepts. It takes Enabled or Suspended.`,
    );
  }
}
