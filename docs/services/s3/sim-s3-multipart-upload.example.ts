/**
 * Uploading a simulated S3 Object in parts.
 */

import {
  CompleteMultipartUploadCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  GetObjectCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "uploads-bucket" }));

const started = await simS3.createMultipartUpload(
  new CreateMultipartUploadCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    ContentType: "text/csv",
  }),
);

const second = await simS3.uploadPart(
  new UploadPartCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    UploadId: started.UploadId,
    PartNumber: 2,
    Body: "2,two\n",
  }),
);

const first = await simS3.uploadPart(
  new UploadPartCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    UploadId: started.UploadId,
    PartNumber: 1,
    Body: "id,name\n1,one\n",
  }),
);

const completed = await simS3.completeMultipartUpload(
  new CompleteMultipartUploadCommand({
    Bucket: "uploads-bucket",
    Key: "report.csv",
    UploadId: started.UploadId,
    MultipartUpload: {
      Parts: [
        { PartNumber: 1, ETag: first.ETag },
        { PartNumber: 2, ETag: second.ETag },
      ],
    },
  }),
);

// The parts joined in part-number order, whichever order they arrived in.
console.log(completed.ETag);

const objectOut = await simS3.getObject(
  new GetObjectCommand({ Bucket: "uploads-bucket", Key: "report.csv" }),
);

console.log(objectOut.Body);
