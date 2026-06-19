export type SimCfnTemplatePrimitiveValue = null | boolean | number | string;

export type SimCfnTemplateValue =
  | SimCfnTemplatePrimitiveValue
  | SimCfnTemplateValue[]
  | SimCfnTemplateValueRecord;

export interface SimCfnTemplateValueRecord {
  [key: string]: SimCfnTemplateValue;
}
