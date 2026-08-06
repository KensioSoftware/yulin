/**
 * A mounted directory this process watches itself, reloading the browser
 * rather than being restarted for it.
 */

import { watch } from "node:fs";
import path from "node:path";

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";
import { simWatch } from "@kensio/yulin/watch";

const built = path.join(process.cwd(), "public");

const simAws = new SimAws();
await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "site" }));
simAws.s3().mountBucketFilesystem("site", built);

const srv = await serveSimAws({ simAws, port: 8787, liveReload: true });

simWatch.reportHeldPath(built);

watch(built, { recursive: true }, () => {
  srv.reload();
});
