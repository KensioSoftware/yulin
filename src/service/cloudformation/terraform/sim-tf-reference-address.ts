import type { TerraformModuleOutput } from "./sim-tf-module-outputs.js";

/**
 * References ordered longest first.
 *
 * Terraform lists the attribute form and the bare resource form of one
 * reference. The attribute form is longer, and it is the one that resolves to
 * the value being read rather than to the resource as a whole.
 */
export function longestFirst(references: readonly string[]): readonly string[] {
  return references.toSorted((a, b) => b.length - a.length);
}

/**
 * The attribute a module output reads off the resource behind it.
 *
 * The output names it, such as `aws_lambda_function.this[0].arn` behind
 * `lambda_function_arn`, and the read table is keyed on that rather than on the
 * output's own name.
 */
export function moduleOutputAttribute(
  qualified: string,
  output: TerraformModuleOutput | undefined,
): string {
  const [longest] = longestFirst(output?.references ?? []);

  void qualified;

  return longest === undefined ? "" : (longest.split(".").pop() ?? "");
}

/**
 * A module-relative reference turned into a plan-wide address.
 *
 * References inside a module name their own module's resources without the
 * module prefix that `planned_values` puts on them. A reference reaching out of
 * the module, through `var.` or a `module.` output, is left alone, because
 * resolving it means following the value through the call rather than
 * rewriting a name.
 */
export function qualifiedReference(
  reference: string,
  modulePath: readonly string[],
): string {
  if (modulePath.length === 0 || reference.startsWith("module.")) {
    return reference;
  }

  const prefix = modulePath.map((call) => `module.${call}`).join(".");

  return `${prefix}.${reference}`;
}
