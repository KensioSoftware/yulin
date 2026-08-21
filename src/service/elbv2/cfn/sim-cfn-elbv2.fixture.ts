import { assertTypeString } from "@kensio/smartass";

import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";

/**
 * One stack Output, as the string an ELBv2 Resource answers with.
 *
 * Every value these tests read back is an ARN, a name or a host name, so
 * asking for it as a string here keeps each assertion about the value rather
 * than about what shape it came out in.
 */
export function simCfnElbV2Output(
  stack: SimCfnDeployedStack,
  name: string,
): string {
  const value = stack.outputs.get(name)?.value;

  assertTypeString(value);

  return value;
}
