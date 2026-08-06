/**
 * Serving a data file whose extension is not one of the web's own.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "public"), {
  // A pinyin dictionary ships a binary frequency table beside its text files.
  additionalFileExtensions: [".freq"],
});
