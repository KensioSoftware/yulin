import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimSsmParameterOutput } from "./parameter.command.js";

/**
 * What one read of a parameter asks for.
 */
export interface SimSsmParameterReadRequest {
  readonly action: string;
  readonly requested: string;
  readonly withDecryption: boolean | undefined;
  readonly caller: SimAwsCaller | undefined;
}

/**
 * A parameter a read resolved, with the stored name it is ordered by.
 *
 * The name is carried separately rather than read back off the output because
 * a batch read has to sort by it, and the reported shape leaves every field
 * optional.
 */
export interface SimSsmFoundParameter {
  readonly name: string;
  readonly output: SimSsmParameterOutput;
}
