/**
 * Declaring the encoding of a compressed mirror in a mounted directory.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  // The mirrored copies keep their own names, so `br/js/app.js` is still typed
  // `text/javascript` from its extension. Nothing about the file says it is
  // compressed, which is what this declares.
  systemMetadata: [{ keyPrefix: "br/", metadata: { ContentEncoding: "br" } }],
});
