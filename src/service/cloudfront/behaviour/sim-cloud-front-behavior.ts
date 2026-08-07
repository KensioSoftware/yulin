import { StaticFactory } from "@kensio/part-factory";
import type { SimArn } from "../../aws/arn.js";

export interface SimCloudFrontBehavior {
  pathPattern?: string; // undefined/default = *
  targetOriginName: string;
  allowedMethods: Set<string>;
  cachedMethods: Set<string>;
  viewerProtocolPolicy?: "allow-all" | "redirect-to-https" | "https-only";
  originPath?: string;
  /**
   * The response headers policy applied to every response this Behavior serves.
   */
  responseHeadersPolicyId?: string | undefined;
  functionAssociations?:
    | undefined
    | {
        viewerRequest?: SimArn;
        viewerResponse?: SimArn;
      };
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
