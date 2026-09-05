import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import {
  simulatedPropertyNames,
  unknownPropertyReason,
  unsimulatedPropertyReasons,
} from "./sim-cfn-lambda-event-source-mapping-property-names.js";

/**
 * Record everything about an AWS::Lambda::EventSourceMapping Resource that the
 * mapping is created without.
 *
 * Nothing here fails the Resource. A mapping missing one of these settings
 * still carries records from the source to the function, and a stack that
 * refused it would take every other Resource down over one line of a template.
 * What the mapping does instead is in `stack.ignoredProperties`.
 */
export function recordUnsimulatedEventSourceMappingProperties(
  resource: SimCfnResource,
  properties: SimCfnTemplateValueRecord,
): void {
  for (const name of Object.keys(properties)) {
    if (simulatedPropertyNames.has(name)) {
      continue;
    }

    const reason =
      unsimulatedPropertyReasons.get(name) ?? unknownPropertyReason;

    resource.ignoreProperty(
      name,
      `AWS::Lambda::EventSourceMapping property ${name} is not simulated: ` +
        `${reason}.`,
    );
  }
}
