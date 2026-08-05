import type { SimCfnPropertyIgnorer } from "../../../cloudformation/resource/ignore/sim-cfn-ignored-property.type.js";

/**
 * The Resource one level of a DynamoDB template read belongs to.
 *
 * A global table nests six levels deep, and every one of them needs to say
 * which Resource it is reading and where to record what it could not act on.
 * Carrying both together keeps a rule a level down from having to be handed
 * two arguments that must not be mixed up.
 */
export interface SimCfnDynamoDbResourceScope {
  readonly logicalId: string;
  readonly ignorer: SimCfnPropertyIgnorer;
}
