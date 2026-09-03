import { buffer } from "node:stream/consumers";
import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamPolicyDocument } from "../../iam/policy/sim-iam-policy.js";
import { simCdkCloudAssemblyFactory } from "../cdk/sim-cdk-cloud-assembly.factory.js";
import type { SimCdkAssetsManifest } from "../cdk/sim-cdk-out-context.js";
import type { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";

const accountId = "111111111111";
const regionName = "eu-west-2";
const stagingBucketName = `cdk-hnb659fds-assets-${accountId}-${regionName}`;
const reportsBucketName = "reports-bucket";

const assetsManifest: SimCdkAssetsManifest = {
  files: {
    abc: {
      source: { path: "asset.txt", packaging: "file" },
      destinations: {
        [`${accountId}-${regionName}`]: {
          bucketName: stagingBucketName,
          objectKey: "abc.txt",
        },
      },
    },
  },
};

const reportsBucketResources = {
  ReportsBucket: {
    Type: "AWS::S3::Bucket",
    Properties: { BucketName: reportsBucketName },
  },
};

/**
 * What a CDK CloudFormation execution Role holds on the staging Bucket under a
 * deployment policy scoped away from `AdministratorAccess`. It reads what a
 * real `cdk deploy` has already published, and writes nothing there.
 */
const stagingBucketReadStatement = {
  Effect: "Allow",
  Action: ["s3:GetObject*", "s3:GetBucket*", "s3:List*"],
  Resource: [
    `arn:aws:s3:::${stagingBucketName}`,
    `arn:aws:s3:::${stagingBucketName}/*`,
  ],
} as const;

/** What the CDK file publishing Role holds on the staging Bucket. */
const stagingBucketWriteStatement = {
  Effect: "Allow",
  Action: ["s3:GetObject*", "s3:GetBucket*", "s3:List*", "s3:PutObject"],
  Resource: [
    `arn:aws:s3:::${stagingBucketName}`,
    `arn:aws:s3:::${stagingBucketName}/*`,
  ],
} as const;

/** What the execution Role needs to create the Stack's own Bucket. */
const reportsBucketStatement = {
  Effect: "Allow",
  Action: "s3:CreateBucket",
  Resource: `arn:aws:s3:::${reportsBucketName}`,
} as const;

describe("the principal a deployment publishes its CDK assets as", () => {
  it("publishes as the assets caller rather than the deployment's own", async () => {
    // Given a publishing Role that may write the staging Bucket, and an
    // execution Role scoped the way a real one is, which may not.
    const simAws = simulation();
    const publisher = await role(simAws, "cdk-file-publishing", [
      stagingBucketWriteStatement,
    ]);
    const executor = await role(simAws, "cdk-exec", [
      stagingBucketReadStatement,
      reportsBucketStatement,
    ]);
    const directory = await assembly();

    // When the Stack is deployed with the two named apart.
    const stack = await simAws.cloudFormation().deployTemplateFile({
      templatePath: templatePath(directory),
      caller: executor,
      assetsCaller: publisher,
    });

    // Then the asset reached the staging Bucket, and the Resource was created
    // by a Role that could never have put it there.
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertIdentical(await publishedAsset(simAws), "content");
  });

  it("refuses a publish the assets caller is not allowed to make", async () => {
    // Given an assets caller allowed only to read, and a deployment caller
    // allowed everything.
    const simAws = simulation();
    const executor = await role(simAws, "cdk-exec", [
      { Effect: "Allow", Action: "*", Resource: "*" },
    ]);
    const reader = await role(simAws, "cdk-reader", [
      stagingBucketReadStatement,
    ]);
    const directory = await assembly();

    // When the Stack is deployed publishing as the Role that may only read.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplateFile({
        templatePath: templatePath(directory),
        caller: executor,
        assetsCaller: reader,
      });
    });

    // Then the refusal names the assets caller, and not the caller that would
    // have been allowed it.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/cdk-reader is not authorized to perform: s3:PutObject`,
    );
  });

  it("publishes as the deployment's caller when no assets caller is named", async () => {
    // Given one Role, holding both what publishing takes and what the Stack
    // takes.
    const simAws = simulation();
    const deployer = await role(simAws, "cdk-deploy", [
      stagingBucketWriteStatement,
      reportsBucketStatement,
    ]);
    const directory = await assembly();

    // When the Stack is deployed naming only that one.
    const stack = await simAws.cloudFormation().deployTemplateFile({
      templatePath: templatePath(directory),
      caller: deployer,
    });

    // Then it published the asset, as a deployment did before the two could be
    // named apart.
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertIdentical(await publishedAsset(simAws), "content");
  });

  it("makes the staging Bucket without authorizing the deployment", async () => {
    // Given an execution Role holding the real scoped permissions, which allow
    // it no s3:CreateBucket anywhere, and no staging Bucket yet.
    const simAws = simulation();
    const executor = await role(simAws, "cdk-exec", [
      stagingBucketWriteStatement,
    ]);
    const directory = await assembly({ resources: {} });
    assertUndefined(simAws.s3().getSimBucketByName(stagingBucketName));

    // When the Stack is deployed as it.
    await simAws.cloudFormation().deployTemplateFile({
      templatePath: templatePath(directory),
      caller: executor,
    });

    // Then the Bucket the bootstrap stack provisions for real is there, and
    // the deployment was never charged for making it.
    assertNonNullable(simAws.s3().getSimBucketByName(stagingBucketName));
    assertIdentical(await publishedAsset(simAws), "content");
  });

  it("lets a Stack's own assets caller override the assembly's", async () => {
    // Given an assembly-wide assets caller that may only read the staging
    // Bucket, and a Stack naming one that may write it.
    const simAws = simulation();
    const publisher = await role(simAws, "cdk-file-publishing", [
      stagingBucketWriteStatement,
    ]);
    const reader = await role(simAws, "cdk-reader", [
      stagingBucketReadStatement,
    ]);
    const executor = await role(simAws, "cdk-exec", [reportsBucketStatement]);
    const directory = await assembly();

    // When the assembly is deployed with the Stack overriding it.
    const stacks = await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      caller: executor,
      assetsCaller: reader,
      stackOptions: { AssetStack: { assetsCaller: publisher } },
    });

    // Then the Stack published as its own, and the assembly's never reached it.
    assertIdentical(
      stacks.get("asset-stack")?.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertIdentical(await publishedAsset(simAws), "content");
  });
});

function simulation(): SimAws {
  return new SimAws({
    defaultAccountId: accountId,
    defaultRegionName: regionName,
  });
}

/**
 * An assembly holding one Stack that stages a file asset beside its template.
 */
async function assembly(
  overrides: { readonly resources?: object } = {},
): Promise<TemporaryDirectory> {
  return await simCdkCloudAssemblyFactory.make({
    stacks: [
      {
        artifactId: "AssetStack",
        stackName: "asset-stack",
        regionName,
        resources: reportsBucketResources,
        assets: assetsManifest,
        ...overrides,
      },
    ],
    assetFiles: { "asset.txt": "content" },
  });
}

function templatePath(directory: TemporaryDirectory): string {
  return directory.join("cdk.out", "AssetStack.template.json");
}

/**
 * A deploy Role holding the given statements, as its ARN caller.
 */
async function role(
  simAws: SimAws,
  roleName: string,
  statements: readonly object[],
): Promise<SimAwsCaller> {
  return await simAws.iam().makeDeployRole({
    roleName,
    policyDocument: {
      Version: "2012-10-17",
      Statement: statements,
    } as SimIamPolicyDocument,
  });
}

/**
 * The staged asset as it was published, read back through simulated S3.
 */
async function publishedAsset(simAws: SimAws): Promise<string> {
  const output = await simAws.s3().getObject({
    input: { Bucket: stagingBucketName, Key: "abc.txt" },
  });
  assertNonNullable(output.Body);

  return Buffer.from(await buffer(output.Body)).toString();
}
