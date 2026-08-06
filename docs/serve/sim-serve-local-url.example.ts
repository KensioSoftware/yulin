/**
 * Turning a simulated AWS URL into one that reaches the local server.
 */

import { CreateBucketCommand } from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

const simAws = new SimAws();
const srv = await serveSimAws({ simAws });

await simAws.s3().createBucket(new CreateBucketCommand({ Bucket: "foo-site" }));

const websiteUrl = simAws.s3().getBucketWebsiteUrl("foo-site");
console.log(srv.localUrl(websiteUrl).toString());
// http://foo-site.s3-website.us-east-1.sim-aws.localhost:<srv.port>/
// with whatever port this run took, since none was pinned.

await srv.close();
