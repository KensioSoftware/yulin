import { MappedFactory } from "@kensio/part-factory";

import type { CfnTemplateBodyRecord } from "../../template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../template/value/sim-cfn-template-value.js";
import { samTransformName } from "../sim-cfn-sam-transform.js";
import { samFunctionType } from "./sim-cfn-sam-function.js";

/**
 * What a test asks for when it wants a SAM template holding one function.
 */
export interface SimCfnSamFunctionTemplateInput {
  /**
   * What this test is about, added to the properties of a function that
   * already runs.
   */
  readonly functionProperties: SimCfnTemplateValueRecord;
  /**
   * The `Globals.Function` defaults the template states. A test stating none
   * gets no `Globals` section.
   */
  readonly globals: SimCfnTemplateValueRecord;
}

/**
 * The logical ID the function carries, and so the name the Lambda function and
 * its execution Role are expanded under.
 */
export const samFunctionTemplateLogicalId = "Rates";

const workingFunction: SimCfnTemplateValueRecord = {
  FunctionName: "rates",
  Handler: "index.handler",
  Runtime: "nodejs22.x",
  InlineCode: "exports.handler = async () => 'rates';",
};

/**
 * Builds a SAM template holding one AWS::Serverless::Function.
 *
 * ```typescript
 * const stack = await simAws.cloudFormation().deployTemplate({
 *   stackName: "rates-stack",
 *   template: simCfnSamFunctionTemplateFactory.make({
 *     functionProperties: { Timeout: 30 },
 *   }),
 * });
 * ```
 *
 * The function runs as it comes, with its source inline and a handler and
 * runtime naming it. What a test states is what the test is about.
 */
export const simCfnSamFunctionTemplateFactory = new MappedFactory<
  SimCfnSamFunctionTemplateInput,
  CfnTemplateBodyRecord
>(
  () => ({ functionProperties: {}, globals: {} }),
  (input) => ({
    Transform: samTransformName,
    ...globalsSection(input),
    Resources: {
      [samFunctionTemplateLogicalId]: {
        Type: samFunctionType,
        Properties: { ...workingFunction, ...input.functionProperties },
      },
    },
  }),
);

/**
 * The `Globals` section, for a template stating defaults to put in one.
 */
function globalsSection(
  input: SimCfnSamFunctionTemplateInput,
): SimCfnTemplateValueRecord {
  if (Object.keys(input.globals).length === 0) {
    return {};
  }

  return { Globals: { Function: input.globals } };
}
