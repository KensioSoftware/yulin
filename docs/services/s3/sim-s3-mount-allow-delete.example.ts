/**
 * Letting a mounted Bucket delete the files it serves.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "uploads" }));

simAws
  .s3()
  .mountBucketFilesystem("uploads", path.join(process.cwd(), "assets"), {
    allowDelete: true,
  });
