/**
 * Keeping a deployment's encoding while dropping its caching locally.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws
  .cloudFormation()
  .deployTemplateFile("cdk.out/SiteStack.template.json");

simAws
  .s3()
  .mountBucketFilesystem("site-bucket", path.join(process.cwd(), "public"), {
    // `content-encoding` is still the deployment's, because this says nothing
    // about it. A year of caching is not what a rebuild wants reaching the
    // browser, so that one is answered here instead.
    systemMetadata: [{ keyPrefix: "", metadata: { CacheControl: "no-store" } }],
  });
