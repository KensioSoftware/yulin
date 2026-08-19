import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";

/**
 * The macro a template names to have its `AWS::Serverless::*` Resources
 * expanded into the plain Resource types CloudFormation deploys.
 */
export const samTransformName = "AWS::Serverless-2016-10-31";

/**
 * Whether the template asks for the SAM transform.
 *
 * `Transform` holds either the one macro name or a list of them. A template
 * running another macro alongside SAM names both.
 */
export function templateNamesSamTransform(
  template: CfnTemplateBodyRecord,
): boolean {
  const transform = template["Transform"];

  if (typeof transform === "string") {
    return transform === samTransformName;
  }

  if (Array.isArray(transform)) {
    return transform.includes(samTransformName);
  }

  return false;
}

/**
 * The template without the sections the expansion has consumed.
 *
 * The expanded body is the one CloudFormation deploys, and by then SAM has
 * been applied. The transform is off the list, and the `Globals` defaults are
 * written into the Resources that took them. Another macro named alongside SAM
 * stays named, since expanding SAM says nothing about it.
 */
export function withoutSamSections(
  template: CfnTemplateBodyRecord,
): CfnTemplateBodyRecord {
  return {
    ...template,
    Globals: undefined,
    Transform: remainingTransforms(template["Transform"]),
  };
}

/**
 * The macros still to run once SAM is off the `Transform` section, where the
 * template named any.
 */
function remainingTransforms(transform: unknown): string[] | undefined {
  if (!Array.isArray(transform)) {
    return undefined;
  }

  const remaining = transform.filter(
    (name: unknown): name is string =>
      typeof name === "string" && name !== samTransformName,
  );

  return remaining.length > 0 ? remaining : undefined;
}
