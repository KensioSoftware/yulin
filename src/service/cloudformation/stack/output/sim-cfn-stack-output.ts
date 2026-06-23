import type { SimCfnTemplateValue } from "../../template/value/sim-cfn-template-value.js";

/**
 * Runtime representation of one resolved CloudFormation Stack Output.
 */
export interface SimCfnStackOutput {
  readonly outputKey: string;
  readonly value: SimCfnTemplateValue;
  readonly description?: string | undefined;
  readonly exportName?: SimCfnTemplateValue | undefined;
}
