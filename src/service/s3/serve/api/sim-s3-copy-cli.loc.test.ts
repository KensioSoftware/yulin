import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

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
} from "@aws-sdk/client-s3";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

const runFile = promisify(execFile);

/**
 * The `aws` CLI moving and copying an Object between two simulated Buckets.
 *
 * The CLI states a move as a copy and then a delete, so a copy the endpoint
 * mishandles destroys the file rather than moving it. That is what this covers:
 * a real client, two served Buckets, and the bytes read back afterwards.
 */
describe("Moving an Object between simulated Buckets with the aws CLI", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });
  const simS3 = simAws.s3();

  const report = "a report of some length, in bytes that can be counted";

  const files = new TemporaryDirectory();
  let cliEnvironment: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await srv.listen();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "inbox" }));
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "archive" }));

    cliEnvironment = await credentialEnvironment();
  });

  afterAll(async () => {
    await srv.close();
  });

  /**
   * The environment an `aws` invocation runs with: a simulated IAM user's
   * access key, and nothing of whatever real AWS configuration the machine
   * running the test happens to have.
   */
  async function credentialEnvironment(): Promise<NodeJS.ProcessEnv> {
    const simIam = simAws.iam();

    await files.resolvePath();

    await simIam.createUser(new CreateUserCommand({ UserName: "Archivist" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Archivist",
        PolicyName: "Archives",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Archivist" }),
    );

    // Every AWS variable the machine exports is dropped rather than only the
    // profile. An inherited session token or endpoint would otherwise travel
    // with the simulated access key and fail the signature.
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith("AWS_")),
    );

    return {
      ...environment,
      AWS_ACCESS_KEY_ID: created.AccessKey.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: created.AccessKey.SecretAccessKey,
      AWS_DEFAULT_REGION: simAws.defaultRegionName,
      AWS_CONFIG_FILE: files.join("aws-config"),
      AWS_SHARED_CREDENTIALS_FILE: files.join("aws-credentials"),
      AWS_EC2_METADATA_DISABLED: "true",
    };
  }

  async function aws(...commandArguments: string[]): Promise<string> {
    const { stdout } = await runFile(
      "aws",
      [...commandArguments, "--endpoint-url", `http://localhost:${srv.port}`],
      { env: cliEnvironment },
    );

    return stdout;
  }

  /**
   * Lay down an Object for one of these to move, under a key of its own so the
   * tests do not read each other's leftovers.
   */
  async function givenReport(key: string): Promise<void> {
    await simS3.putObject(
      new PutObjectCommand({ Bucket: "inbox", Key: key, Body: report }),
    );
  }

  /**
   * The text an Object holds, read through the simulator's own body stream.
   */
  async function bodyText(body: AsyncIterable<Uint8Array>): Promise<string> {
    return Buffer.concat(await Array.fromAsync(body)).toString("utf8");
  }

  /**
   * What one Bucket holds under a prefix, read through the simulator rather
   * than through the endpoint under test.
   */
  async function stored(
    bucketName: string,
    prefix: string,
  ): Promise<readonly { Key?: string; Size?: number }[]> {
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: bucketName, Prefix: prefix }),
    );

    return listed.Contents ?? [];
  }

  it("copies an Object between Buckets, leaving the source where it was", async () => {
    // Given an Object in one Bucket
    await givenReport("copied.pdf");

    // When it is copied into another
    await aws(
      "s3",
      "cp",
      "s3://inbox/copied.pdf",
      "s3://archive/2026/copied.pdf",
    );

    // Then the copy holds the bytes rather than nothing at all
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "2026/copied.pdf" }),
    );
    assertDefined(read.Body, "the copied Object body");
    assertIdentical(await bodyText(read.Body), report);

    // And the original is still there, since a copy is not a move
    assertArrayLength(await stored("inbox", "copied.pdf"), 1);
  });

  it("moves an Object, and the size the CLI lists is the size it moved", async () => {
    // Given an Object in one Bucket
    await givenReport("moved.pdf");

    // When it is moved into another, which the CLI states as a copy and then a
    // delete
    await aws(
      "s3",
      "mv",
      "s3://inbox/moved.pdf",
      "s3://archive/2026/moved.pdf",
    );

    // Then the destination holds the file at its real size, rather than the
    // zero-byte Object an empty PUT would have left
    const listed = await aws("s3", "ls", "s3://archive/2026/");
    assertStringIncludes(listed, `${report.length} moved.pdf`);

    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "2026/moved.pdf" }),
    );
    assertDefined(read.Body, "the moved Object body");
    assertIdentical(await bodyText(read.Body), report);

    // And the source is empty, which is the half of the move that made the
    // first half worth checking
    assertArrayEmpty(await stored("inbox", "moved.pdf"));
  });

  it("copies a file to and from a key holding a space", async () => {
    // Given a report under a key someone typed rather than a program generated
    await givenReport("quarterly report.pdf");

    // When the CLI downloads it and uploads it again under another such key
    await aws(
      "s3",
      "cp",
      "s3://inbox/quarterly report.pdf",
      files.join("q.pdf"),
    );
    await aws(
      "s3",
      "cp",
      files.join("q.pdf"),
      "s3://archive/2026/quarterly report.pdf",
    );

    // Then the download and the upload both hold the report, having travelled
    // a path carrying the space percent-encoded
    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- a temporary directory this test just made
    const downloaded = await readFile(files.join("q.pdf"), "utf8");
    assertIdentical(downloaded, report);

    const read = await simS3.getObject(
      new GetObjectCommand({
        Bucket: "archive",
        Key: "2026/quarterly report.pdf",
      }),
    );
    assertDefined(read.Body, "the uploaded Object body");
    assertIdentical(await bodyText(read.Body), report);
  });

  it("moves an Object whose key is a path of its own", async () => {
    // Given a key made of several segments, which the header has to carry
    // whole rather than reading its first slash as the Bucket
    await givenReport("2025/q4/report.pdf");

    // When it is moved
    await aws(
      "s3",
      "mv",
      "s3://inbox/2025/q4/report.pdf",
      "s3://archive/2025/q4/report.pdf",
    );

    // Then the destination holds the bytes and the source is empty
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "archive", Key: "2025/q4/report.pdf" }),
    );
    assertDefined(read.Body, "the moved Object body");
    assertIdentical(await bodyText(read.Body), report);
    assertArrayEmpty(await stored("inbox", "2025/q4/report.pdf"));
  });
});
