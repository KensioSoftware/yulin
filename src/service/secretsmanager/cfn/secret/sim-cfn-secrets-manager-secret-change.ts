import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import { simCfnTemplateSignature } from "../../../cloudformation/stack/update/sim-cfn-template-signature.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";

/**
 * Whether the change between two definitions of a secret replaces it.
 *
 * `Name` is the only property real CloudFormation replaces a secret for. It is
 * read as the template writes it, before intrinsic resolution, which is all the
 * update plan has to go on. Two different expressions resolving to the same
 * name replace the secret, which is the safe way round to be wrong.
 */
export function simCfnSecretsManagerSecretReplaced(
  current: SimCfnResource,
  updated: SimCfnResource,
): boolean {
  return nameSignature(current) !== nameSignature(updated);
}

/**
 * Whether the new template asks the secret to hold a different value.
 *
 * A secret takes its value from `SecretString` or `GenerateSecretString`, so a
 * change to either is a new version. A change to anything else leaves the
 * versions alone, which is what keeps a generated password across an update.
 */
export function simCfnSecretsManagerSecretValueChanged(
  currentProperties: SimCfnTemplateValueRecord,
  updatedProperties: SimCfnTemplateValueRecord,
): boolean {
  return (
    valueSignature(currentProperties) !== valueSignature(updatedProperties)
  );
}

/**
 * A stable string for the two properties a secret's value comes from.
 *
 * A property the template leaves out signs as null, which no declared value can
 * collide with. `SecretString` is a string and `GenerateSecretString` is an
 * object.
 */
function valueSignature(properties: SimCfnTemplateValueRecord): string {
  return simCfnTemplateSignature([
    properties["SecretString"] ?? null,
    properties["GenerateSecretString"] ?? null,
  ]);
}

function nameSignature(resource: SimCfnResource): string {
  const name = resource.properties["Name"];

  return name === undefined ? "" : simCfnTemplateSignature(name);
}
