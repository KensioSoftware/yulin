/**
 * Writing an Object with the system metadata S3 returns on a read.
 */

import {
  CreateBucketCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simS3 = new SimAws().s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "site" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "site",
    Key: "app.js",
    Body: "compressed bytes",
    CacheControl: "public, max-age=31536000, immutable",
    ContentDisposition: 'inline; filename="app.js"',
    ContentEncoding: "br",
    ContentLanguage: "en-GB",
    ContentType: "text/javascript",
    Expires: new Date("2027-01-02T03:04:05Z"),
  }),
);

const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "site", Key: "app.js" }),
);

// Each header comes back in the field a read describes an Object with.
console.log(objectOut.ContentEncoding); // br
console.log(objectOut.ExpiresString); // Sat, 02 Jan 2027 03:04:05 GMT
