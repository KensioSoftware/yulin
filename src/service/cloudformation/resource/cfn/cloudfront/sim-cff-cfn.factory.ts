import { MappedFactory } from "@kensio/part-factory";
import type { SimCfnResource } from "../../sim-cfn-resource.js";
import { simCfnResourceFactory } from "../../sim-cfn-resource.factory.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../template/value/sim-cfn-template-value.js";

interface SimCfnCffResourceFactoryProps {
  readonly logicalId: string;
  readonly properties: SimCfnTemplateValueRecord;
  readonly metadata?: SimCfnTemplateValue;
}

/**
 * Generate fake AWS::CloudFront::Function SimCfnResource instances.
 */
export const simCfnCffResourceFactory = new MappedFactory<
  SimCfnCffResourceFactoryProps,
  SimCfnResource
>(
  () => ({
    logicalId: "RewriteFunction",
    properties: {},
  }),
  (factoryProps) =>
    simCfnResourceFactory.make({
      logicalId: factoryProps.logicalId,
      template: {
        Type: "AWS::CloudFront::Function",
        Properties: {
          FunctionCode: "function handler(event) { return event.request; }",
          FunctionConfig: { Runtime: "cloudfront-js-2.0" },
          ...factoryProps.properties,
        },
        ...(factoryProps.metadata !== undefined && {
          Metadata: factoryProps.metadata,
        }),
      },
    }),
);
