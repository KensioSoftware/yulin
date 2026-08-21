/**
 * What one import of a plan did with every resource in it.
 *
 * A resource is mapped to a Resource of its own, folded into another
 * resource's Resource, or skipped. The three add up to the plan's managed
 * resource count, which is what makes the mapped fraction a fraction of
 * something.
 */
export interface TerraformImportReport {
  readonly total: number;
  readonly mapped: readonly TerraformImportedResource[];
  readonly folded: readonly TerraformImportedResource[];
  readonly skipped: readonly TerraformSkippedResource[];
  /** Attributes a mapping could not carry across, named per resource. */
  readonly lost: readonly TerraformLostAttribute[];
}

export interface TerraformImportedResource {
  /** The Terraform address, such as `module.uploads.aws_s3_bucket.this`. */
  readonly address: string;
  /** The Terraform resource type, such as `aws_s3_bucket`. */
  readonly type: string;
  /** The CloudFormation type it was deployed as, for a mapped resource. */
  readonly cfnType?: string;
  /** The logical ID the template declares it under, for a mapped resource. */
  readonly logicalId?: string;
}

export interface TerraformSkippedResource {
  readonly address: string;
  readonly type: string;
  readonly reason: TerraformSkipReason;
}

export type TerraformSkipReason =
  | "no mapping for resource type"
  | "not an AWS provider resource"
  | "fold target not found"
  | "unresolved required attribute"
  | "a property value the service refuses"
  | "references a resource that was skipped";

export interface TerraformLostAttribute {
  readonly address: string;
  readonly attribute: string;
}
