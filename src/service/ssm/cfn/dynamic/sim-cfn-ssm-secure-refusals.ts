import { SimCloudFormationValidationError } from "../../../cloudformation/error/sim-cloudformation.error.js";
import type {
  SimCfnDynamicReference,
  SimCfnDynamicReferenceSite,
} from "../../../cloudformation/template/dynamic/sim-cfn-dynamic-reference.type.js";
import type { SimSsmParameterOutput } from "../../command/parameter/parameter.command.js";
import { acceptsSsmSecureReference } from "./sim-cfn-ssm-secure-reference-properties.js";

/** What a Resource carrying no `Type` is called in a refusal. */
const untypedResource = "A Resource with no Type";

/** The parameter type an `ssm-secure` reference reads. */
const secureString = "SecureString";

/**
 * Fail a reference written into a property CloudFormation does not read one
 * in.
 *
 * This fails the Resource rather than resolving to a stand-in value. A
 * template breaking the rule is wrong wherever it deploys, so saying so is
 * more use than deploying something that was never the secret.
 */
export function requireSsmSecureReferenceProperty(
  reference: SimCfnDynamicReference,
  site: SimCfnDynamicReferenceSite,
): void {
  if (acceptsSsmSecureReference(site.resourceType, site.propertyPath)) {
    return;
  }

  throw new SimCloudFormationValidationError(
    `${site.resourceType ?? untypedResource} holds ${reference.text}. ` +
      `CloudFormation reads an ssm-secure dynamic reference in eleven ` +
      `Resource properties, and this is not one of them.`,
  );
}

/**
 * Fail a reference naming a parameter stored in the clear.
 *
 * Real CloudFormation refuses one the same way. The plain `ssm` reference
 * beside it is what reads a `String` or a `StringList`.
 */
export function requireSecureStringParameter(
  name: string,
  parameter: SimSsmParameterOutput,
): void {
  if (parameter.Type === secureString) {
    return;
  }

  throw new SimCloudFormationValidationError(
    `'${name}' is a ${parameter.Type ?? "typeless"} parameter, and an ` +
      `ssm-secure dynamic reference reads a ${secureString}. Read a plain ` +
      `parameter with an ssm reference instead.`,
  );
}
