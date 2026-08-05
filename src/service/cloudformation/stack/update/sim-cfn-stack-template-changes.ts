import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { simCfnTemplateSignature } from "./sim-cfn-template-signature.js";

/**
 * Whether a new template says anything different from the deployed one, apart
 * from its Resources.
 *
 * An update that changes nothing but an Output, a Description, or a section
 * this simulation does not read is still an update, so the whole template body
 * is compared alongside the Resource half of the difference.
 *
 * The body alone is not enough, because a Parameter given a new value changes
 * what the template means without changing a character of it. The Outputs are
 * therefore also compared as they resolve, which is where such a change shows
 * through. SimCfnStackUpdatePlan compares the Resources the same way.
 */
export function simCfnStackTemplateChanged(
  current: SimCfnTemplate,
  updated: SimCfnTemplate,
): boolean {
  return (
    simCfnTemplateSignature(current.template) !==
      simCfnTemplateSignature(updated.template) ||
    simCfnTemplateSignature(outputRecord(current)) !==
      simCfnTemplateSignature(outputRecord(updated))
  );
}

/**
 * A template's Output entries in one record, for the signature to be taken of.
 */
function outputRecord(template: SimCfnTemplate): SimCfnTemplateValueRecord {
  return Object.fromEntries(
    template
      .outputTemplates()
      .map((outputTemplate) => [
        outputTemplate.outputKey,
        outputTemplate.template,
      ]),
  );
}
