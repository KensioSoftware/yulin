import type { CfnTemplateBodyRecord } from "../template/sim-cfn-template.js";

/**
 * Adapts a parsed template file into the template to deploy.
 *
 * Given the body as it was synthesized, and answering with the body simulated
 * AWS should be holding, so the file on disk stays the real one.
 */
export type SimCfnTemplateFileTransform = (
  template: CfnTemplateBodyRecord,
) => CfnTemplateBodyRecord;

/**
 * Adapt the parsed template, if the deployment brought something to adapt it
 * with.
 *
 * A transform that throws is said to have thrown, because the file it was given
 * is the synthesized one and the reason it could not be deployed is not in
 * there. On a watched change this reads as the failed update it is.
 */
export function transformedTemplate(
  template: CfnTemplateBodyRecord,
  transform: SimCfnTemplateFileTransform | undefined,
): CfnTemplateBodyRecord {
  if (transform === undefined) {
    return template;
  }

  try {
    return transform(template);
  } catch (error) {
    throw new Error(
      `Sim CloudFormation template transform threw: ${transformFailure(error)}`,
      { cause: error },
    );
  }
}

function transformFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
