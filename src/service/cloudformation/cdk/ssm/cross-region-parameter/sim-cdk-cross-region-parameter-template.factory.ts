import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";

/**
 * What a test asks for when it wants the template CDK synthesizes for an
 * `experimental.EdgeFunction` in a Stack outside us-east-1.
 *
 * Only the reader is here. The function, the version and the SSM parameter go
 * into a support Stack of their own, which a test writes the parameter for
 * directly when it wants one.
 */
export interface SimCdkCrossRegionParameterTemplateInput {
  /** The parameter the reader reads. */
  readonly parameterName: string;

  /** The Region the reader reads it from. */
  readonly regionName: string;

  /** Merged in last, so a test states the one property it is about. */
  readonly readerProperties: SimCfnTemplateValueRecord;

  /** The attribute the Stack Output reads off the reader. */
  readonly attributeName: string;
}

/**
 * Builds the template CDK synthesizes for a cross-Region parameter read.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "site-stack",
 *   template: simCdkCrossRegionParameterTemplateFactory.make({
 *     parameterName: "/cdk/EdgeFunctionArn/eu-west-1/SiteStack/EdgeFn",
 *   }),
 * });
 * ```
 *
 * The `ServiceToken` points at nothing. CDK's provider function is the one
 * this factory reads the parameter in place of, and the Resource is read
 * around the token rather than through it.
 */
export const simCdkCrossRegionParameterTemplateFactory = new MappedFactory<
  SimCdkCrossRegionParameterTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({
    parameterName: "/cdk/EdgeFunctionArn/eu-west-1/SiteStack/EdgeFn",
    regionName: "us-east-1",
    readerProperties: {},
    attributeName: "FunctionArn",
  }),
  (input) => ({
    Resources: {
      ArnReader: {
        Type: "Custom::CrossRegionStringParameterReader",
        Properties: {
          ServiceToken: "arn:aws:lambda:eu-west-1:888888888888:function:cdk",
          Region: input.regionName,
          ParameterName: input.parameterName,
          RefreshToken: "EdgeFnCurrentVersion",
          ...input.readerProperties,
        },
      },
    },
    Outputs: {
      EdgeFunctionArn: {
        Value: { "Fn::GetAtt": ["ArnReader", input.attributeName] },
      },
    },
  }),
);
