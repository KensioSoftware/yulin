/**
 * Walking a simulated S3 Bucket one folder at a time.
 */

import {
  CreateBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site-assets" }));

for (const key of ["img/logo.png", "img/icons/tick.png", "index.html"]) {
  await simS3.putObject(
    new PutObjectCommand({ Bucket: "site-assets", Key: key, Body: key }),
  );
}

const top = await simS3.listObjectsV2(
  new ListObjectsV2Command({ Bucket: "site-assets", Delimiter: "/" }),
);

// One folder, and the one key that sits beside it.
console.log(top.CommonPrefixes?.map((folder) => folder.Prefix)); // ["img/"]
console.log(top.Contents?.map((object) => object.Key)); // ["index.html"]

const folder = await simS3.listObjectsV2(
  new ListObjectsV2Command({
    Bucket: "site-assets",
    Prefix: "img/",
    Delimiter: "/",
  }),
);

// A delimiter inside the Prefix is stepped over, so this lists what is
// directly in `img/` rather than rolling the whole Bucket back up.
console.log(folder.CommonPrefixes?.map((child) => child.Prefix)); // ["img/icons/"]
console.log(folder.Contents?.map((object) => object.Key)); // ["img/logo.png"]
