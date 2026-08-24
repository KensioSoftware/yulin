import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import { SimS3MalformedXml } from "../../error/sim-s3.error.js";
import type { SimS3LifecycleConfiguration } from "../put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

const ruleStatuses: ReadonlySet<string> = new Set(["Enabled", "Disabled"]);

/**
 * Refuse a lifecycle configuration real S3 would refuse to store.
 *
 * Real S3 answers MalformedXML for a configuration carrying no rules and for a
 * rule whose Status is anything but Enabled or Disabled. Both are worth
 * keeping, because a rule stored under a status nothing recognises would read
 * back looking configured.
 */
export function validateSimS3LifecycleRules(
  configuration: SimS3LifecycleConfiguration,
  bucketName: SimS3BucketName,
): void {
  const rules = configuration.Rules ?? [];

  if (rules.length === 0) {
    throw new SimS3MalformedXml(
      `Lifecycle configuration for S3 Bucket ${bucketName} states no rules`,
    );
  }

  for (const rule of rules) {
    if (rule.Status === undefined || !ruleStatuses.has(rule.Status)) {
      throw new SimS3MalformedXml(
        `Lifecycle rule ${rule.ID ?? "(unnamed)"} for S3 Bucket ` +
          `${bucketName} must state a Status of Enabled or Disabled`,
      );
    }
  }
}
