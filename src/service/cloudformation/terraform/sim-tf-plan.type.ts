/**
 * The parts of a `terraform show -json <planfile>` document this import reads.
 *
 * Terraform documents this as the plan representation, and its `format_version`
 * has been `1.x` since Terraform 0.12. Only the members the import uses are
 * described here. A plan carries a great deal more.
 */
export interface TerraformPlan {
  readonly format_version?: string;
  readonly terraform_version?: string;
  readonly planned_values?: { readonly root_module?: TerraformPlannedModule };
  readonly resource_changes?: readonly TerraformResourceChange[];
  readonly configuration?: { readonly root_module?: TerraformConfigModule };
}

/**
 * One module's resolved resources, and the modules it calls.
 *
 * `count` and `for_each` are already expanded here. A resource declared with
 * `count = 3` appears as three entries carrying `index` 0, 1 and 2.
 */
export interface TerraformPlannedModule {
  readonly resources?: readonly TerraformPlannedResource[];
  readonly child_modules?: readonly TerraformPlannedChildModule[];
}

export interface TerraformPlannedChildModule extends TerraformPlannedModule {
  /** The fully qualified call address, such as `module.uploads_bucket`. */
  readonly address?: string;
}

export interface TerraformPlannedResource {
  readonly address: string;
  readonly mode?: string;
  readonly type: string;
  readonly name: string;
  readonly index?: string | number;
  readonly provider_name?: string;
  readonly values?: Record<string, unknown>;
}

/**
 * What a plan says it will do to one resource.
 *
 * `after` holds the attributes whose values the plan resolved, and
 * `after_unknown` marks the ones it could not. An attribute unknown at plan
 * time is absent from `after` and carries `true` in `after_unknown`, so the two
 * have to be read together to tell "no value" from "not known yet".
 */
export interface TerraformResourceChange {
  readonly address: string;
  readonly mode?: string;
  readonly type: string;
  readonly name: string;
  readonly change?: {
    readonly actions?: readonly string[];
    readonly after?: Record<string, unknown> | null;
    readonly after_unknown?: Record<string, unknown> | null;
  };
}

/**
 * The declared configuration, holding the reference graph.
 *
 * Addresses here are relative to the module the resource is declared in, while
 * `planned_values` addresses are fully qualified. Joining the two means walking
 * both trees together rather than matching on address.
 */
export interface TerraformConfigModule {
  readonly resources?: readonly TerraformConfigResource[];
  readonly module_calls?: Record<
    string,
    { readonly module?: TerraformConfigModule }
  >;
}

export interface TerraformConfigResource {
  readonly address: string;
  readonly mode?: string;
  readonly type: string;
  readonly name: string;
  readonly expressions?: Record<string, unknown>;
  readonly depends_on?: readonly string[];
}

/**
 * A `references` entry, which is a resource address optionally followed by the
 * attribute being read off it.
 *
 * Terraform lists both forms for one reference. `aws_iam_role.processor.arn`
 * names the attribute and `aws_iam_role.processor` names the resource, and both
 * appear in the same array.
 */
export interface TerraformExpression {
  readonly constant_value?: unknown;
  readonly references?: readonly string[];
}
