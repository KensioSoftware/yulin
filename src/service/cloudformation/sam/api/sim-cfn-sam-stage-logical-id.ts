import { createHash } from "node:crypto";

import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";

/**
 * The logical ID SAM builds for an API's stage, out of the API's logical ID
 * and the stage's name.
 *
 * A name that can be part of an identifier goes in whole, and anything else is
 * hashed, down to the ten hexadecimal characters SAM takes off a SHA-1 of the
 * name. A stage the template names with an intrinsic function has no name to
 * hash at this point, and SAM hashes the empty string for it.
 *
 * Both API kinds build the ID this way. An HTTP API has one form more, for the
 * `$default` stage a REST API has no equivalent of, and spells that one before
 * reaching here.
 */
export function samStageLogicalId(
  logicalId: string,
  stageName: SimCfnTemplateValue,
): string {
  if (typeof stageName === "string" && /^[A-Za-z0-9]+$/.test(stageName)) {
    return `${logicalId}${stageName}Stage`;
  }

  return `${logicalId}Stage${samStageNameHash(stageName)}`;
}

/**
 * The hash SAM builds a stage's logical ID out of when the name cannot be part
 * of one.
 */
function samStageNameHash(stageName: SimCfnTemplateValue): string {
  const name = typeof stageName === "string" ? stageName : "";

  return createHash("sha1").update(name).digest("hex").slice(0, 10);
}
