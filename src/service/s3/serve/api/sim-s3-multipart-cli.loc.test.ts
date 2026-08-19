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
} from "@aws-sdk/client-s3";
import {
  assertIdentical,
  assertStringEndsWith,
  assertStringIncludes,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

const runFile = promisify(execFile);

/**
 * The `aws` CLI copying a file large enough that it switches to a multipart
 * upload, against simulated S3 served on a localhost endpoint.
 *
 * The CLI switches above eight megabytes, sends the parts concurrently and
 * finishes them in whatever order they complete, so this is the whole of the
 * multipart path driven by a real client rather than by a test's idea of one.
 * Nothing here knows the upload was in parts: `aws s3 cp` is asked for a file
 * and `aws s3 ls` is asked what the Bucket holds.
 */
describe("Copying a large file in and out of simulated S3 with the aws CLI", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });
  const simS3 = simAws.s3();

  /** Comfortably above the CLI's 8MB multipart threshold. */
  const fileSize = 12 * 1024 * 1024;

  /**
   * The byte the copied file holds at one offset.
   *
   * Every byte is derived from its own offset, so parts joined in the wrong
   * order, or one part left out, changes what is read back.
   */
  const byteAt = (offset: number): number => (offset * 31) % 256;

  const files = new TemporaryDirectory();
  let filePath: string;
  let cliEnvironment: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await srv.listen();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));

    // Content the parts cannot be confused with each other by.
    const content = Buffer.from(
      Uint8Array.from({ length: fileSize }, (_unused, offset) =>
        byteAt(offset),
      ),
    );

    await files.writeFile("big.bin", content);
    filePath = files.join("big.bin");

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

    await simIam.createUser(new CreateUserCommand({ UserName: "Copier" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Copier",
        PolicyName: "Copies",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Copier" }),
    );

    const { AWS_PROFILE: _profile, ...environment } = process.env;

    return {
      ...environment,
      AWS_ACCESS_KEY_ID: created.AccessKey.AccessKeyId,
      AWS_SECRET_ACCESS_KEY: created.AccessKey.SecretAccessKey,
      AWS_DEFAULT_REGION: simAws.defaultRegionName,
      // Whatever real AWS configuration the machine running this happens to
      // have is not this test's, so the CLI is pointed away from it.
      AWS_CONFIG_FILE: files.join("aws-config"),
      AWS_SHARED_CREDENTIALS_FILE: files.join("aws-credentials"),
      AWS_EC2_METADATA_DISABLED: "true",
    };
  }

  async function aws(...commandArguments: string[]): Promise<string> {
    const { stdout } = await runFile(
      "aws",
      [...commandArguments, "--endpoint-url", `http://localhost:${srv.port}`],
      { env: cliEnvironment, maxBuffer: 8 * 1024 * 1024 },
    );

    return stdout;
  }

  it("copies a file above the multipart threshold, and lists its whole size", async () => {
    // Given a 12MB file, which the CLI will send as several parts
    // When it is copied into the Bucket
    await aws("s3", "cp", filePath, "s3://widgets/big.bin");

    // Then the CLI reports one Object of the whole size, rather than the parts
    // it happened to send
    const listed = await aws("s3", "ls", "s3://widgets/");
    assertStringIncludes(listed, `${fileSize} big.bin`);
  });

  it("stores the parts joined in order, byte for byte", async () => {
    // Given the copied file
    await aws("s3", "cp", filePath, "s3://widgets/checked.bin");

    // When it is read back through the simulator
    const read = await simS3.getObject(
      new GetObjectCommand({ Bucket: "widgets", Key: "checked.bin" }),
    );

    // Then it is the file that was copied, which a part joined out of order or
    // left out would not be
    assertDefined(read.Body, "the stored Object body");
    const stored = Buffer.concat(await Array.fromAsync(read.Body));
    assertIdentical(stored.byteLength, fileSize);
    assertIdentical(stored.at(0), byteAt(0));
    assertIdentical(stored.at(9 * 1024 * 1024), byteAt(9 * 1024 * 1024));
    assertIdentical(stored.at(fileSize - 1), byteAt(fileSize - 1));
  });

  it("gives the Object the multipart ETag, so a content-hash comparison holds", async () => {
    // Given a file copied in parts
    await aws("s3", "cp", filePath, "s3://widgets/etagged.bin");

    // When the Bucket is listed
    const listed = await simS3.listObjectsV2(
      new ListObjectsV2Command({ Bucket: "widgets", Prefix: "etagged.bin" }),
    );

    // Then the ETag carries the part count, which is what tells a tool
    // comparing content hashes that this one is not the MD5 of the file
    const etag = listed.Contents?.[0]?.ETag;
    assertDefined(etag, "the listed Object's ETag");
    assertStringEndsWith(etag, '-2"');
  });

  it("copies the Object back out again", async () => {
    // Given an Object uploaded in parts
    await aws("s3", "cp", filePath, "s3://widgets/round-trip.bin");

    // When it is copied back to a local file
    const downloadPath = files.join("downloaded.bin");
    await aws("s3", "cp", "s3://widgets/round-trip.bin", downloadPath);

    // Then the CLI is satisfied with what it got, which is the point of the
    // whole exercise: the simulated Bucket now holds a file of real size that
    // ordinary tooling can put in and take out again
    const listed = await aws("s3", "ls", "s3://widgets/round-trip.bin");
    assertStringIncludes(listed, `${fileSize} round-trip.bin`);
  });

  it("writes the downloaded file byte for byte", async () => {
    // Given an Object above the size the CLI downloads in one request, which
    // it fetches as several ranged reads at once
    await aws("s3", "cp", filePath, "s3://widgets/checked-download.bin");

    // When it is copied back to a local file
    const downloadPath = files.join("checked-download.bin");
    await aws("s3", "cp", "s3://widgets/checked-download.bin", downloadPath);

    // Then the file on disk is the file that was uploaded, which a read
    // answering each of those requests with the whole Object would not be
    // oxlint-disable-next-line security/detect-non-literal-fs-filename -- this test's own temporary directory
    const downloaded = await readFile(downloadPath);
    assertIdentical(downloaded.byteLength, fileSize);
    assertIdentical(downloaded.at(0), byteAt(0));
    assertIdentical(downloaded.at(9 * 1024 * 1024), byteAt(9 * 1024 * 1024));
    assertIdentical(downloaded.at(fileSize - 1), byteAt(fileSize - 1));
  });
});
