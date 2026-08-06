/**
 * Reloading connected browsers after changing simulated content in place.
 */

import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws, liveReload: true });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));
await simAws.s3().putObject(
  new PutObjectCommand({
    Bucket: "foo-site",
    Key: "index.html",
    Body: "<h1>Changed</h1>",
    ContentType: "text/html; charset=utf-8",
  }),
);

srv.reload();

await srv.close();
