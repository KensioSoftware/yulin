import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../template/value/sim-cfn-template-value.js";
import { isSamTemplateRecord } from "../sim-cfn-sam-record.js";

/**
 * The tag SAM adds to every function it creates.
 */
const samCreatedByTag: SimCfnTemplateValueRecord = {
  Key: "lambda:createdBy",
  Value: "SAM",
};

/**
 * The `Tags` the expanded Lambda function carries.
 *
 * SAM states tags as a map, and AWS::Lambda::Function takes a list of `Key`
 * and `Value` pairs. SAM adds `lambda:createdBy` with the value `SAM` to every
 * function it expands, whether or not the template tags it.
 */
export function samFunctionTags(
  functionProperties: SimCfnTemplateValueRecord,
): SimCfnTemplateValueRecord {
  const tags = functionProperties["Tags"];
  const declared = isSamTemplateRecord(tags) ? Object.entries(tags) : [];

  return {
    Tags: [
      samCreatedByTag,
      ...declared.map(
        ([key, value]: [
          string,
          SimCfnTemplateValue,
        ]): SimCfnTemplateValueRecord => ({
          Key: key,
          Value: value,
        }),
      ),
    ],
  };
}
