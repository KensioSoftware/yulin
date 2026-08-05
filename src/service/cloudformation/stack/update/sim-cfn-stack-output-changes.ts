import type { SimCfnTemplate } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { simCfnTemplateSignature } from "./sim-cfn-template-signature.js";

/**
 * Whether a new template says something different about a Stack's Outputs.
 *
 * An update that changes nothing but an Output is still an update, so this is
 * asked alongside the Resource half of the difference. The Outputs compared are
 * resolved as far as they go before Resources exist, which is far enough for a
 * changed Parameter to show through.
 */
export function simCfnStackOutputsChanged(
  current: SimCfnTemplate,
  updated: SimCfnTemplate,
): boolean {
  return (
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
