import type { SimCfnTemplateValue } from "../service/cloudformation/template/value/sim-cfn-template-value.js";
import type { TerraformMappingContext } from "./sim-tf-attributes.js";
import type { TerraformResource } from "./sim-tf-resource.type.js";
import type { TerraformSkipReason } from "./sim-tf-report.type.js";

/**
 * One CloudFormation Resource built from one Terraform resource.
 *
 * `lost` names the Terraform attributes the mapping could not carry across.
 * A mapping records them rather than dropping them quietly, because an
 * attribute that goes missing without a word is the kind of gap that only turns
 * up later as a test passing for the wrong reason.
 */
export interface TerraformMappedResource {
  readonly Type: string;
  readonly Properties: Record<string, SimCfnTemplateValue>;
  readonly lost?: readonly string[];
  /**
   * Properties the simulated service will refuse the Resource without.
   *
   * A plan can leave a required value unresolvable, and a Resource built
   * without it fails and takes the Stack's other Resources with it. Naming the
   * properties here lets the import drop that one Resource and record it,
   * which is what sim CloudFormation already does with a Resource type it
   * cannot create.
   */
  readonly requires?: readonly string[];

  /**
   * Why this Resource is one the simulated service would refuse whatever the
   * plan resolved.
   *
   * `requires` covers a property the service needs and the plan could not
   * fill. This covers the other shape, where every property is there and one
   * of them holds a value the target refuses. Terraform's `SecureString`
   * parameter is the example. Real CloudFormation refuses that type on an
   * `AWS::SSM::Parameter` because the plaintext would sit in the template, and
   * so does the simulation, so a Resource built for one fails the Stack around
   * it rather than only itself.
   */
  readonly refused?: TerraformSkipReason | undefined;
}

export type TerraformResourceMapping = (
  context: TerraformMappingContext,
) => TerraformMappedResource;

/** One resource of a plan, with the mapping that will build its Resource. */
export interface TerraformDeclaration {
  readonly resource: TerraformResource;
  readonly mapping: TerraformResourceMapping;
}

/**
 * How one Terraform resource contributes to another resource's properties.
 *
 * The AWS provider splits a single CloudFormation Resource across several
 * Terraform resources. Six `aws_s3_bucket_*` resources configure one bucket,
 * and CloudFormation carries all six as properties of one `AWS::S3::Bucket`.
 * A fold names the attribute holding the parent's address, and returns the
 * properties to merge into the parent.
 *
 * The properties the parent already carries are given along with the resource,
 * for the fold that adds to a list rather than setting a property outright. An
 * EventBridge rule's targets are one Terraform resource each and one `Targets`
 * list on the Resource, so the second target of a rule has to find the first.
 * A fold writing a property of its own ignores them.
 */
export interface TerraformResourceFold {
  /** The attribute naming the resource these properties belong to. */
  readonly parentAttribute: string;
  readonly properties: (
    context: TerraformMappingContext,
    parent?: Record<string, SimCfnTemplateValue>,
  ) => Record<string, SimCfnTemplateValue>;

  /**
   * The Terraform attributes this fold could not carry across, as a mapping's
   * own `lost` names them. A fold that carries everything it was given
   * declares none.
   */
  readonly lost?: (context: TerraformMappingContext) => readonly string[];
}
