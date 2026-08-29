import {
  simCffInStage,
  type SimCloudFrontFunctionStage,
} from "../../cff/sim-cff-stage.js";
import type {
  SimCloudFrontFunction,
  SimCloudFrontFunctionName,
} from "../../cff/sim-cloudfront-function.js";
import { SimCloudFrontNoSuchFunctionExists } from "../../error/sim-cloudfront.error.js";
import type { SimCloudFrontFunctionMap } from "../create-function/create-function.handler.js";

/**
 * Resolve a Function a stage can be read from.
 *
 * A name the Account holds no Function under is refused, and so is one whose
 * Function has not reached the stage asked for. Both answer with
 * NoSuchFunctionExists. That is what CloudFront answers when a stage holds
 * nothing under the name asked for.
 */
export function simCfFunctionInStage(
  cloudFrontFunctions: SimCloudFrontFunctionMap,
  functionName: string,
  stage: SimCloudFrontFunctionStage,
): SimCloudFrontFunction {
  const cloudFrontFunction = cloudFrontFunctions.get(
    functionName as SimCloudFrontFunctionName,
  );

  if (cloudFrontFunction === undefined) {
    throw new SimCloudFrontNoSuchFunctionExists(
      `No sim CloudFront Function named ${functionName}`,
    );
  }

  if (!simCffInStage(cloudFrontFunction, stage)) {
    throw new SimCloudFrontNoSuchFunctionExists(
      `Sim CloudFront Function ${functionName} has not been published, so it ` +
        `is in DEVELOPMENT and not in ${stage}`,
    );
  }

  return cloudFrontFunction;
}
