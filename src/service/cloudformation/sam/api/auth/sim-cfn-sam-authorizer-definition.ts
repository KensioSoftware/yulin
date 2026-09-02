import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import type { SamApiAuthApi } from "./sim-cfn-sam-api-auth.types.js";

/**
 * One authorizer of an `Auth` block, as the expansion of its kind is asked
 * about it.
 */
export interface SamAuthorizerDefinition {
  /** The API the authorizer belongs to. */
  readonly api: SamApiAuthApi;
  /** The name the `Authorizers` map declared it under. */
  readonly name: string;
  /** What the template stated for it. */
  readonly definition: SimCfnTemplateValueRecord;
}
