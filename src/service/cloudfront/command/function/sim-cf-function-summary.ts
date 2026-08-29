import type { SimCloudFrontFunctionStage } from "../../cff/sim-cff-stage.js";
import type { SimCloudFrontFunction } from "../../cff/sim-cloudfront-function.js";
import type { SimCfFunctionSummary } from "./sim-cf-function-command.types.js";

/**
 * Describe a Function the way ListFunctions and DescribeFunction both do.
 *
 * The stage comes from the request rather than the Function, because a
 * published Function is in both stages and answers under whichever one was
 * asked for.
 */
export function simCfFunctionSummary(
  cloudFrontFunction: SimCloudFrontFunction,
  stage: SimCloudFrontFunctionStage,
): SimCfFunctionSummary {
  const keyValueStore = cloudFrontFunction.keyValueStore;

  return {
    Name: cloudFrontFunction.name,
    Status: cloudFrontFunction.status,
    FunctionConfig: {
      Comment: cloudFrontFunction.config.comment,
      Runtime: cloudFrontFunction.config.runtime,
      ...(keyValueStore !== undefined && {
        KeyValueStoreAssociations: {
          Quantity: 1,
          Items: [{ KeyValueStoreARN: keyValueStore.arn }],
        },
      }),
    },
    FunctionMetadata: {
      FunctionARN: cloudFrontFunction.arn,
      Stage: stage,
      CreatedTime: cloudFrontFunction.config.createdTime,
      LastModifiedTime: cloudFrontFunction.config.lastModifiedTime,
    },
  };
}
