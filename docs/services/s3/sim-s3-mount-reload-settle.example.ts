/**
 * Waiting longer for a slow build to finish writing.
 */

import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));

simAws.s3().mountBucketFilesystem("site", path.join(process.cwd(), "dist"), {
  reload: srv,
  settleMs: 500,
});
