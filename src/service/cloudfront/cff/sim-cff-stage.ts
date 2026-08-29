import { SimCloudFrontInvalidArgument } from "../error/sim-cloudfront.error.js";
import type { SimCloudFrontFunction } from "./sim-cloudfront-function.js";

/**
 * The two stages a CloudFront Function can be read from.
 *
 * A Function is created into DEVELOPMENT and reaches LIVE once it is
 * published. LIVE is the copy a Distribution runs.
 */
export type SimCloudFrontFunctionStage = "DEVELOPMENT" | "LIVE";

const simCffStages = new Set<SimCloudFrontFunctionStage>([
  "DEVELOPMENT",
  "LIVE",
]);

/**
 * Read the stage a request asked for.
 *
 * CloudFront defaults an omitted `Stage` to DEVELOPMENT, the copy a Function
 * is created into, and refuses a value that names neither stage.
 */
export function simCffRequestedStage(
  stage: string | undefined,
): SimCloudFrontFunctionStage {
  if (stage === undefined) {
    return "DEVELOPMENT";
  }

  if (!simCffStages.has(stage as SimCloudFrontFunctionStage)) {
    throw new SimCloudFrontInvalidArgument(
      `CloudFront Function stage ${stage} is neither DEVELOPMENT nor LIVE`,
    );
  }

  return stage as SimCloudFrontFunctionStage;
}

/**
 * Whether a Function can be read from a stage.
 *
 * Every Function is in DEVELOPMENT from the moment it is created. It reaches
 * LIVE once it is published, so a Function still waiting to publish answers to
 * DEVELOPMENT alone.
 */
export function simCffInStage(
  cloudFrontFunction: SimCloudFrontFunction,
  stage: SimCloudFrontFunctionStage,
): boolean {
  return stage === "DEVELOPMENT" || cloudFrontFunction.status !== "UNPUBLISHED";
}
