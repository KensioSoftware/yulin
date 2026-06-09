import { StaticFactory } from "@kensio/part-factory";

export interface SimCloudFrontBehavior {
  pathPattern?: string; // undefined/default = *
  targetOriginName: string;
  allowedMethods: Set<string>;
  cachedMethods: Set<string>;
  viewerProtocolPolicy?: "allow-all" | "redirect-to-https" | "https-only";
  originPath?: string;
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
