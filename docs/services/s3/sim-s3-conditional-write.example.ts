/**
 * Writing a simulated S3 Object only where the key is free.
 */

import {
  CopyObjectCommand,
  CreateBucketCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simS3.createBucket(new CreateBucketCommand({ Bucket: "audio-bucket" }));

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "audio-bucket",
    Key: "uploads/take-1.mp3",
    Body: "first take",
  }),
);

for (let attempt = 0; attempt < 2; attempt++) {
  try {
    await simS3.copyObject(
      new CopyObjectCommand({
        Bucket: "audio-bucket",
        Key: "shared/take.mp3",
        CopySource: "audio-bucket/uploads/take-1.mp3",
        IfNoneMatch: "*",
      }),
    );
    console.log("copied");
  } catch (error) {
    // The second attempt finds the shared key taken.
    if (error instanceof Error && error.name === "PreconditionFailed") {
      console.log("already there");
    } else {
      throw error;
    }
  }
}
