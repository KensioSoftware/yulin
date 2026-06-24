import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";

export type SimCfnMappings = Record<
  string,
  Record<string, SimCfnTemplateValueRecord>
>;
