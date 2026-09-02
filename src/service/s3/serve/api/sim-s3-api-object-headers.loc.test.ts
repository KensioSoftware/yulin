import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  CreateBucketCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { assertArrayLength, assertIdentical } from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";

/**
 * What a client outside the process reads and writes about an Object beyond
 * its bytes.
 *
 * The headers describing an Object and the encoding of the keys a listing
 * answers with both travel in parts of the request that only exist over HTTP:
 * a header, a query parameter, an XML element. A client reaching simulated S3
 * through an endpoint URL is the only way to cover them end to end.
 */
describe("Serving what a simulated S3 request says about an Object", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });

  let client: S3Client;

  beforeAll(async () => {
    await srv.listen();

    const simIam = simAws.iam();

    await simIam.createUser(new CreateUserCommand({ UserName: "Publisher" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Publisher",
        PolicyName: "Published",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Publisher" }),
    );

    client = new S3Client({
      region: simAws.defaultRegionName,
      endpoint: `http://localhost:${srv.port}`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: created.AccessKey.AccessKeyId,
        secretAccessKey: created.AccessKey.SecretAccessKey,
      },
    });
  });

  afterAll(async () => {
    await srv.close();
  });

  it("keeps the metadata headers an upload was sent with", async () => {
    // Given a Bucket to publish into
    await client.send(new CreateBucketCommand({ Bucket: "described" }));

    // When an Object is written with everything S3 remembers about one
    await client.send(
      new PutObjectCommand({
        Bucket: "described",
        Key: "app.js",
        Body: "compressed bytes",
        CacheControl: "public, max-age=31536000, immutable",
        ContentEncoding: "br",
        ContentType: "text/javascript",
        Expires: new Date("2027-01-02T03:04:05Z"),
      }),
    );

    // Then a read describes it with all of them, expiry included, having
    // carried each one over the wire as the header real S3 carries it in
    const output = await client.send(
      new GetObjectCommand({ Bucket: "described", Key: "app.js" }),
    );
    assertIdentical(output.CacheControl, "public, max-age=31536000, immutable");
    assertIdentical(output.ContentEncoding, "br");
    assertIdentical(output.ExpiresString, "Sat, 02 Jan 2027 03:04:05 GMT");
  });

  it("serves the headers a read named in place of the Object's own", async () => {
    // Given a stored PDF
    await client.send(new CreateBucketCommand({ Bucket: "reports" }));
    await client.send(
      new PutObjectCommand({
        Bucket: "reports",
        Key: "q3.pdf",
        Body: "quarterly numbers",
        ContentType: "application/pdf",
      }),
    );

    // When it is read by a request naming the headers it wants back
    const output = await client.send(
      new GetObjectCommand({
        Bucket: "reports",
        Key: "q3.pdf",
        ResponseContentType: "application/octet-stream",
        ResponseContentDisposition: 'attachment; filename="q3.pdf"',
      }),
    );

    // Then the read is answered with those, while the Object goes on being
    // the PDF it was stored as
    assertIdentical(output.ContentType, "application/octet-stream");
    assertIdentical(output.ContentDisposition, 'attachment; filename="q3.pdf"');

    const stored = await client.send(
      new GetObjectCommand({ Bucket: "reports", Key: "q3.pdf" }),
    );
    assertIdentical(stored.ContentType, "application/pdf");
  });

  it("encodes the keys of a listing that asked for encoded keys", async () => {
    // Given a Bucket holding keys with characters a URL escapes
    await client.send(new CreateBucketCommand({ Bucket: "uploads" }));

    await Promise.all(
      ["a&b.txt", "holiday photo.png"].map(async (key) =>
        client.send(
          new PutObjectCommand({ Bucket: "uploads", Key: key, Body: key }),
        ),
      ),
    );

    // When the Bucket is listed with URL encoding asked for
    const output = await client.send(
      new ListObjectsV2Command({ Bucket: "uploads", EncodingType: "url" }),
    );

    // Then the document carries the keys encoded, and says so, which is what
    // lets a key hold a character XML cannot
    assertArrayLength(output.Contents, 2);
    assertIdentical(output.Contents[0].Key, "a%26b.txt");
    assertIdentical(output.Contents[1].Key, "holiday+photo.png");
    assertIdentical(output.EncodingType, "url");
  });
});
