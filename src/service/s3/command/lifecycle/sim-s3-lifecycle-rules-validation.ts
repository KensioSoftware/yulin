import type { SimS3BucketName } from "../../bucket/sim-s3-bucket.js";
import { SimS3MalformedXml } from "../../error/sim-s3.error.js";
import { simS3StorageClassFrom } from "../../object/s3-storage-class.js";
import type {
  SimS3LifecycleConfiguration,
  SimS3LifecycleRule,
} from "../put-bucket-lifecycle-configuration/put-bucket-lifecycle-configuration.command.js";

const ruleStatuses: ReadonlySet<string> = new Set(["Enabled", "Disabled"]);

/**
 * The fields that make a rule do something, for the refusal to name.
 */
const ruleActionNames =
  "Expiration, Transitions, NoncurrentVersionExpiration, " +
  "NoncurrentVersionTransitions or AbortIncompleteMultipartUpload";

/**
 * Whether a rule states an action to take on the Objects it selects.
 *
 * Real S3 refuses a rule stating none, because a rule that selects Objects and
 * then does nothing with them is a configuration with no meaning. An empty
 * list of transitions counts as none. The field is there and the rule still
 * transitions nothing.
 */
function statesAnAction(rule: SimS3LifecycleRule): boolean {
  return [
    rule.Expiration !== undefined,
    rule.NoncurrentVersionExpiration !== undefined,
    rule.AbortIncompleteMultipartUpload !== undefined,
    (rule.Transitions ?? []).length > 0,
    (rule.NoncurrentVersionTransitions ?? []).length > 0,
  ].includes(true);
}

/**
 * Refuse a lifecycle configuration real S3 would refuse to store.
 *
 * Real S3 answers MalformedXML for a configuration carrying no rules, for a
 * rule whose Status is anything but Enabled or Disabled, and for a rule
 * stating no action at all. All three are worth keeping, because a rule real
 * S3 would have rejected reads back here looking configured.
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
    validateRule(rule, bucketName);
  }
}

function validateRule(
  rule: SimS3LifecycleRule,
  bucketName: SimS3BucketName,
): void {
  const named = rule.ID ?? "(unnamed)";

  if (rule.Status === undefined || !ruleStatuses.has(rule.Status)) {
    throw new SimS3MalformedXml(
      `Lifecycle rule ${named} for S3 Bucket ${bucketName} must state a ` +
        `Status of Enabled or Disabled`,
    );
  }

  if (!statesAnAction(rule)) {
    throw new SimS3MalformedXml(
      `Lifecycle rule ${named} for S3 Bucket ${bucketName} must state at ` +
        `least one of ${ruleActionNames}`,
    );
  }

  validateTransitionClasses(rule, named, bucketName);
}

/**
 * Refuse a transition to a storage class S3 has no such class for.
 *
 * The class is read here, where the configuration is stored, so a rule that
 * names one nothing can transition to is refused before it is applied to
 * anything.
 */
function validateTransitionClasses(
  rule: SimS3LifecycleRule,
  named: string,
  bucketName: SimS3BucketName,
): void {
  const transitions = [
    ...(rule.Transitions ?? []),
    ...(rule.NoncurrentVersionTransitions ?? []),
  ];

  for (const transition of transitions) {
    simS3StorageClassFrom(
      transition.StorageClass,
      `lifecycle rule ${named} of S3 Bucket ${bucketName}`,
    );
  }
}
