/**
 * What one import of a plan did with every resource in it.
 *
 * A resource is mapped, folded into another resource, or skipped. The three
 * add up to the plan's managed resource count, which is what makes the
 * mapped fraction a fraction of something.
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
  readonly address: string;
  readonly type: string;
  readonly cfnType?: string;
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
  | "references a resource that was skipped";

export interface TerraformLostAttribute {
  readonly address: string;
  readonly attribute: string;
}
