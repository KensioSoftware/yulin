import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  CreateAccessKeyCommand,
  CreateUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import { CreateBucketCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertStringIncludes,
  assertStringNotIncludes,
} from "@kensio/smartass";
import { afterAll, beforeAll, describe, it } from "vitest";

import { SimAwsLocalServer } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";

const runFile = promisify(execFile);

/**
 * The `aws` CLI walking a simulated Bucket as a folder tree.
 *
 * `aws s3 ls` sends a delimiter of its own accord and prints a `PRE` line for
 * every prefix it gets back, so this covers the whole path a person browsing a
 * Bucket takes: the query string, the rollup and the XML, driven by a real
 * client rather than by a test's idea of one.
 */
describe("Listing simulated S3 a folder at a time with the aws CLI", () => {
  const simAws = new SimAws();
  const srv = new SimAwsLocalServer({ simAws });
  const simS3 = simAws.s3();

  const files = new TemporaryDirectory();
  let cliEnvironment: NodeJS.ProcessEnv;

  beforeAll(async () => {
    await srv.listen();
    await simS3.createBucket(new CreateBucketCommand({ Bucket: "widgets" }));

    await Promise.all(
      ["img/logo.png", "img/icons/small.png", "js/app.js", "index.html"].map(
        async (key) =>
          simS3.putObject(
            new PutObjectCommand({ Bucket: "widgets", Key: key, Body: key }),
          ),
      ),
    );

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

    await simIam.createUser(new CreateUserCommand({ UserName: "Browser" }));
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "Browser",
        PolicyName: "Browses",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: { Effect: "Allow", Action: "s3:*", Resource: "*" },
        }),
      }),
    );
    const created = await simIam.createAccessKey(
      new CreateAccessKeyCommand({ UserName: "Browser" }),
    );

    const { AWS_PROFILE: _profile, ...environment } = process.env;

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

  it("prints a PRE line for each folder at the top of the Bucket", async () => {
    // Given a Bucket whose keys read as a folder tree
    // When the top of it is listed
    const listed = await aws("s3", "ls", "s3://widgets/");

    // Then the folders are named once each and the key beside them is listed,
    // rather than every key in the Bucket coming back flat
    assertStringIncludes(listed, "PRE img/");
    assertStringIncludes(listed, "PRE js/");
    assertStringIncludes(listed, "index.html");
    assertStringNotIncludes(listed, "logo.png");
  });

  it("walks into a folder", async () => {
    // Given the folders the listing above named
    // When one of them is listed
    const listed = await aws("s3", "ls", "s3://widgets/img/");

    // Then the folder inside it comes back as a prefix, and the key beside it
    // as an Object
    assertStringIncludes(listed, "PRE icons/");
    assertStringIncludes(listed, "logo.png");
    assertStringNotIncludes(listed, "app.js");
  });

  it("lists every key when asked to recurse", async () => {
    // Given the same Bucket
    // When it is listed recursively, which sends no delimiter
    const listed = await aws("s3", "ls", "s3://widgets/", "--recursive");

    // Then nothing is rolled up and every key comes back in full
    assertStringNotIncludes(listed, "PRE ");
    assertStringIncludes(listed, "img/icons/small.png");
    assertStringIncludes(listed, "img/logo.png");
    assertStringIncludes(listed, "js/app.js");
    assertStringIncludes(listed, "index.html");
  });
});
