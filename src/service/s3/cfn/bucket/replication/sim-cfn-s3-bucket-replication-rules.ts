import { isRecord } from "../../../../../util/type-guard/record.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../../cloudformation/template/value/sim-cfn-template-value.js";
import { s3BucketResourceError } from "../error/sim-cfn-s3-bucket-error.js";

/**
 * The AWS::S3::Bucket ReplicationConfiguration constraints real S3 enforces.
 *
 * Replication itself is not simulated. The property is recorded against the
 * Resource and the Bucket is created without it, and no Object is ever copied.
 * What the value says is still read, because a configuration real S3 answers
 * with a 400 otherwise deploys here and reaches CREATE_COMPLETE. A test
 * standing on that deployment reports a template AWS refuses as working, which
 * is the one failure a local deploy of a real template exists to catch.
 *
 * These are the constraints the S3 API documents and the CloudFormation
 * Resource schema leaves out, so cfn-lint passes a template failing any of
 * them.
 */
export function validateSimCfnS3BucketReplication(
  logicalId: string,
  properties: SimCfnTemplateValueRecord,
): void {
  const declared = properties["ReplicationConfiguration"];

  if (!isRecord(declared)) {
    return;
  }

  refuseUnversionedSource(logicalId, properties);

  const rules = declared["Rules"];

  if (!Array.isArray(rules)) {
    return;
  }

  rules.forEach((rule, index) => {
    validateRule(logicalId, rule, `ReplicationConfiguration Rules[${index}]`);
  });
}

/**
 * Refuse replication on a Bucket that keeps one version of an Object.
 *
 * Real S3 requires versioning on the source Bucket and on the destination.
 * Only the source is checked, and it is read from the template rather than
 * from the Bucket, because `VersioningConfiguration` is skipped too and no
 * simulated Bucket carries a versioning state to read. The destination is a
 * Bucket ARN that may belong to another Stack or another Account, so there is
 * nothing here to read it from at all.
 */
function refuseUnversionedSource(
  logicalId: string,
  properties: SimCfnTemplateValueRecord,
): void {
  const versioning = properties["VersioningConfiguration"];

  if (isRecord(versioning) && versioning["Status"] === "Enabled") {
    return;
  }

  throw s3BucketResourceError(
    logicalId,
    "Versioning must be Enabled on the Bucket to apply a " +
      "ReplicationConfiguration",
  );
}

function validateRule(
  logicalId: string,
  declared: SimCfnTemplateValue,
  path: string,
): void {
  if (!isRecord(declared)) {
    return;
  }

  refuseEventThresholdWithoutReplicationTime(logicalId, declared, path);
  refuseFilterWithoutItsCompanions(logicalId, declared, path);
}

/**
 * Refuse a replication metrics threshold on a rule that has not turned
 * Replication Time Control on.
 *
 * `Metrics.EventThreshold` says when to raise
 * `s3:Replication:OperationMissedThreshold`, which only S3 RTC measures
 * against. CDK renders `ReplicationTimeValue.FIFTEEN_MINUTES` passed as
 * `metrics` into the threshold on its own, so this reaches a template through
 * an ordinary L2 call.
 */
function refuseEventThresholdWithoutReplicationTime(
  logicalId: string,
  rule: SimCfnTemplateValueRecord,
  path: string,
): void {
  const destination = rule["Destination"];

  if (!isRecord(destination)) {
    return;
  }

  const metrics = destination["Metrics"];

  if (!isRecord(metrics) || metrics["EventThreshold"] === undefined) {
    return;
  }

  const replicationTime = destination["ReplicationTime"];

  if (isRecord(replicationTime) && replicationTime["Status"] === "Enabled") {
    return;
  }

  throw s3BucketResourceError(
    logicalId,
    `${path} Destination Metrics cannot contain an event threshold when ` +
      "ReplicationTime is not specified or Disabled",
  );
}

/**
 * Refuse a rule stating a Filter without the fields S3 requires alongside one.
 *
 * The S3 API documents `DeleteMarkerReplication`, `Status` and `Priority` as
 * required alongside `Filter`. A rule carrying the older `Prefix` instead needs
 * none of them, so the check is on `Filter` rather than on the rule.
 */
function refuseFilterWithoutItsCompanions(
  logicalId: string,
  rule: SimCfnTemplateValueRecord,
  path: string,
): void {
  if (rule["Filter"] === undefined) {
    return;
  }

  const missing = [
    ["DeleteMarkerReplication", rule["DeleteMarkerReplication"]] as const,
    ["Priority", rule["Priority"]] as const,
    ["Status", rule["Status"]] as const,
  ]
    .filter(([, value]) => value === undefined)
    .map(([name]) => name);

  if (missing.length === 0) {
    return;
  }

  throw s3BucketResourceError(
    logicalId,
    `${path} states a Filter, which requires ${missing.join(", ")} as well`,
  );
}
