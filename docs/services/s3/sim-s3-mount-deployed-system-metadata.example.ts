/**
 * Serving a rebuilt directory as the deployment that filled the Bucket did.
 */

import path from "node:path";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

// The Stack publishes the site. Its BucketDeployments say what they set, such
// as `content-encoding: br` for the compressed mirror under `br/`.
await simAws
  .cloudFormation()
  .deployTemplateFile("cdk.out/SiteStack.template.json");

// The Bucket then serves the generator's output as it is rebuilt. Nothing about
// those files says how they were compressed, and nothing here has to either.
simAws
  .s3()
  .mountBucketFilesystem("site-bucket", path.join(process.cwd(), "public"));
