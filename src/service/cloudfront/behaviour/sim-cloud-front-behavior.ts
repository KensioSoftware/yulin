import { StaticFactory } from "@kensio/part-factory";
import type { SimArn } from "../../aws/arn.js";
import type { SimCfEdgeAssociations } from "../edge/sim-cf-edge-association.js";

export interface SimCloudFrontBehavior {
  pathPattern?: string; // undefined/default = *
  targetOriginName: string;
  allowedMethods: Set<string>;
  /**
   * The methods this Behavior caches a response for. A request made with any
   * other method reaches the Origin every time.
   */
  cachedMethods: Set<string>;
  viewerProtocolPolicy?: "allow-all" | "redirect-to-https" | "https-only";
  originPath?: string;
  /**
   * The response headers policy applied to every response this Behavior serves.
   */
  responseHeadersPolicyId?: string | undefined;
  /**
   * The cache policy this Behavior was given, whether a template created it or
   * AWS manages it. It decides what the Distribution's cache keys on, and a
   * Behavior naming no policy this simulation holds caches nothing.
   */
  cachePolicyId?: string | undefined;
  /**
   * The origin request policy this Behavior was given, whether a template
   * created it or AWS manages it. What reaches the Origin does not read it
   * yet.
   */
  originRequestPolicyId?: string | undefined;
  functionAssociations?:
    | undefined
    | {
        viewerRequest?: SimArn;
        viewerResponse?: SimArn;
      };
  /**
   * The Lambda@Edge functions this Behavior runs, by event type.
   */
  lambdaFunctionAssociations?: SimCfEdgeAssociations | undefined;
}

/**
 * Generate a fake SimCloudFrontBehavior.
 */
export const simCloudFrontBehaviorFactory =
  new StaticFactory<SimCloudFrontBehavior>({
    pathPattern: "*",
    targetOriginName: "foobar-origin",
    allowedMethods: new Set(["GET", "HEAD"]),
    cachedMethods: new Set(["GET", "HEAD"]),
    viewerProtocolPolicy: "allow-all",
    originPath: "/object.json",
  });
