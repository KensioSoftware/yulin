/** The provider whose resource types this import knows how to map. */
export const terraformAwsProvider = "hashicorp/aws";

/**
 * One resource of a plan, with everything the import needs about it in one
 * place.
 *
 * A plan splits what it knows about a resource across three sections.
 * `planned_values` holds resolved attributes, `resource_changes` marks the
 * attributes that stayed unknown, and `configuration` holds what the resource
 * refers to. This is the three joined up, and it is what every mapping, every
 * reference and every report entry is written against.
 */
export interface TerraformResource {
  /** The fully qualified address, such as `module.uploads.aws_s3_bucket.this`. */
  readonly address: string;
  readonly type: string;
  readonly name: string;
  /** The `count` or `for_each` key, for one instance of an expanded resource. */
  readonly index: string | number | undefined;
  /** The provider that owns the type, such as `hashicorp/aws`. */
  readonly provider: string;
  /** Attributes the plan resolved to a value. */
  readonly values: Record<string, unknown>;
  /** `after_unknown`, whose `true` leaves mark attributes still to be decided. */
  readonly unknown: Record<string, unknown>;
  /** Declared expressions, holding the `references` this resource reads. */
  readonly expressions: Record<string, unknown>;
  /** Explicit `depends_on` addresses, relative to the declaring module. */
  readonly dependsOn: readonly string[];
  /**
   * What `for_each` iterates, as the references its expression holds.
   *
   * A resource expanded by `for_each` reads `each.value` and `each.key`, and
   * neither names anything the plan resolved. What the collection was built
   * from is the only thing behind them.
   */
  readonly forEach: readonly string[];
  /** The module call path this resource was declared under. */
  readonly modulePath: readonly string[];
}
