import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectVersionsCommand,
  PutBucketVersioningCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const simS3 = simAws.s3();

await simAws.cloudFormation().deployTemplate({
  stackName: "history-stack",
  template: {
    Resources: {
      HistoryBucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          BucketName: "history",
          VersioningConfiguration: { Status: "Enabled" },
        },
      },
    },
  },
});

// A Bucket already holding Objects can be versioned afterwards. Those Objects
// take the null version id, as they do in real S3.
await simS3.putBucketVersioning(
  new PutBucketVersioningCommand({
    Bucket: "history",
    VersioningConfiguration: { Status: "Enabled" },
  }),
);

const first = await simS3.putObject(
  new PutObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    Body: JSON.stringify({ words: ["好"] }),
  }),
);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    Body: JSON.stringify({ words: [] }),
  }),
);

// The write did not overwrite anything. Both versions are listed, newest
// first, with IsLatest on the one a plain read answers with.
const listed = await simS3.listObjectVersions(
  new ListObjectVersionsCommand({ Bucket: "history", Prefix: "snapshots/" }),
);

console.log(listed.Versions?.map((version) => version.IsLatest));

// Recovery is a read of the earlier version and a write of it back.
const earlier = await simS3.getObject(
  new GetObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    VersionId: first.VersionId,
  }),
);

const recovered = await Array.fromAsync(earlier.Body ?? []);

await simS3.putObject(
  new PutObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    Body: Buffer.concat(recovered),
  }),
);

// A delete writes a marker over the key rather than removing anything, and
// deleting the marker by its own id brings the Object back.
const deleted = await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
  }),
);

console.log(deleted.DeleteMarker); // true

await simS3.deleteObject(
  new DeleteObjectCommand({
    Bucket: "history",
    Key: "snapshots/reader-1.json",
    VersionId: deleted.VersionId,
  }),
);
