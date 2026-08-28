import {
  assertIdentical,
  assertMapSize,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import {
  assemblyStackBucketName,
  simCdkCloudAssemblyFactory,
} from "../cdk/sim-cdk-cloud-assembly.factory.js";
import { makeSimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIamUsername } from "../../iam/user/sim-iam-user.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { jsonStringify } from "../../../util/type-guard/json.js";

/**
 * An organization that denies its Accounts' root principals everything, which
 * is the shape a deployment could not be tested against while it was always
 * decided as the root.
 */
const denyAccountRoot = {
  Version: "2012-10-17",
  Statement: {
    Effect: "Deny",
    Action: "*",
    Resource: "*",
    Condition: { ArnLike: { "aws:PrincipalArn": "arn:aws:iam::*:root" } },
  },
} as const;

const reportsBucketTemplate = {
  Resources: {
    ReportsBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "reports-bucket" },
    },
  },
};

describe("the principal a simulated CloudFormation deployment runs as", () => {
  it("creates Resources as the Role the deployment names", async () => {
    // Given an organization denying the Account root everything, and a deploy
    // Role the policy leaves alone.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await deployRole(simAws, accountId, "deployer", "s3:*");

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack is deployed as that Role.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "reports-stack",
      template: reportsBucketTemplate,
      caller: deployer,
    });

    // Then the Resource was created, because the deny naming the root never
    // reached the Role the deployment ran as.
    assertIdentical(
      stack.getResource("ReportsBucket")?.status,
      "CREATE_COMPLETE",
    );
    assertNonNullable(simAws.s3().getSimBucketByName("reports-bucket"));
  });

  it("leaves a deployment that names no caller decided as the Account root", async () => {
    // Given the same organization, denying the Account root everything.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    // When a Stack is deployed without naming a principal.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "reports-stack",
        template: reportsBucketTemplate,
      });
    });

    // Then it was decided as the root, as it was before there was anything to
    // say otherwise.
    assertStringIncludes(error.message, `arn:aws:iam::${accountId}:root`);
    assertStringIncludes(
      error.message,
      "with an explicit deny in a service control policy",
    );
    assertUndefined(simAws.s3().getSimBucketByName("reports-bucket"));
  });

  it("fails a Resource the principal it names is not allowed to create", async () => {
    // Given a deploy Role that may read Buckets and not make them.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const reader = await deployRole(
      simAws,
      accountId,
      "reader",
      "s3:GetObject",
    );

    // When a Stack declaring a Bucket is deployed as it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "reports-stack",
        template: reportsBucketTemplate,
        caller: reader,
      });
    });

    // Then the refusal names the Role rather than the Account root.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/reader is not authorized to perform: s3:CreateBucket`,
    );
    assertIdentical(
      simAws
        .cloudFormation()
        .getStackByName("reports-stack")
        ?.getResource("ReportsBucket")?.status,
      "CREATE_FAILED",
    );
  });

  it("tears the Stack down as the principal it was deployed as", async () => {
    // Given a Stack deployed as a Role, in an organization denying the root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await deployRole(simAws, accountId, "deployer", "*");

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    const cloudFormation = simAws.cloudFormation();

    await cloudFormation.deployTemplate({
      stackName: "reports-stack",
      template: reportsBucketTemplate,
      caller: deployer,
    });

    // When the Stack is deleted.
    await cloudFormation.deleteStack(
      { input: { StackName: "reports-stack" } },
      { caller: deployer },
    );
    await cloudFormation.waitForStackDeleteComplete("reports-stack");

    // Then the teardown ran as that Role too, so the Bucket has gone.
    assertUndefined(simAws.s3().getSimBucketByName("reports-bucket"));
  });

  it("applies a template file update as the principal the deployment named", async () => {
    // Given a Stack deployed from a template file as a Role, in an
    // organization denying the root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });

    const deployer = await deployRole(simAws, accountId, "deployer", "s3:*");

    simAws
      .organizations()
      .attachServiceControlPolicy(accountId, denyAccountRoot);

    const directory = new TemporaryDirectory();

    await directory.writeFile(
      "Site.template.json",
      jsonStringify({ Resources: { Site: bucketResource("site-content") } }),
    );

    const templatePath = directory.join("Site.template.json");

    await simAws
      .cloudFormation()
      .deployTemplateFile({ templatePath, caller: deployer });

    // When the file is synthesized again with another Bucket in it, and
    // applied without naming a principal of its own.
    await directory.writeFile(
      "Site.template.json",
      jsonStringify({
        Resources: {
          Site: bucketResource("site-content"),
          Uploads: bucketResource("site-uploads"),
        },
      }),
    );

    await simAws.cloudFormation().updateTemplateFile(templatePath);

    // Then the update ran as the Role the Stack was deployed as, rather than
    // falling back to the root the policy denies.
    assertNonNullable(simAws.s3().getSimBucketByName("site-uploads"));
  });

  it("refuses a key the deployment may create and may not disable", async () => {
    // Given a deploy Role that may make KMS keys and nothing else.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const maker = await deployRole(simAws, accountId, "maker", "kms:CreateKey");

    // When it deploys a key the template asks to be disabled from the start.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "keys-stack",
        template: {
          Resources: {
            ReportsKey: {
              Type: "AWS::KMS::Key",
              Properties: { Enabled: false },
            },
          },
        },
        caller: maker,
      });
    });

    // Then disabling it was refused, rather than done as nobody in particular.
    assertStringIncludes(error.message, "kms:DisableKey");
  });

  it("leaves a User's policies on it when the teardown may not delete it", async () => {
    // Given a Stack holding a User with an inline policy, deployed as a Role
    // that may not delete Users.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({ defaultAccountId: accountId });
    const maker = await deployRole(simAws, accountId, "maker", [
      "iam:CreateUser",
      "iam:PutUserPolicy",
    ]);
    const cloudFormation = simAws.cloudFormation();
    const stack = await cloudFormation.deployTemplate({
      stackName: "people-stack",
      template: {
        Resources: {
          Reader: {
            Type: "AWS::IAM::User",
            Properties: {
              UserName: "reader",
              Policies: [
                {
                  PolicyName: "ReadReports",
                  PolicyDocument: {
                    Version: "2012-10-17",
                    Statement: {
                      Effect: "Allow",
                      Action: "s3:GetObject",
                      Resource: "*",
                    },
                  },
                },
              ],
            },
          },
        },
      },
      caller: maker,
    });

    // When the Stack is torn down.
    await assertThrowsErrorAsync(async () => {
      await stack.teardown();
    });

    // Then the User is where it was, with the policy the Stack put on it.
    const user = simAws
      .account(accountId)
      .iam()
      .users.get("reader" as SimIamUsername);

    assertNonNullable(user);
    assertMapSize(user.inlinePolicies, 1);
  });

  it("deploys every Stack in a cloud assembly as the caller it is given", async () => {
    // Given an assembly of one Stack, and a Role that may not make Buckets.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
      defaultRegionName: "eu-west-2",
    });
    const reader = await deployRole(
      simAws,
      accountId,
      "reader",
      "s3:GetObject",
    );
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [{ artifactId: "SiteStack", regionName: "eu-west-2" }],
    });

    // When the assembly is deployed as it.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployCdkOut({
        directoryPath: directory.join("cdk.out"),
        caller: reader,
      });
    });

    // Then the Stack was refused as that Role rather than as the Account root.
    assertStringIncludes(
      error.message,
      `arn:aws:iam::${accountId}:role/reader is not authorized to perform: s3:CreateBucket`,
    );
  });

  it("lets a Stack's own caller override the assembly's", async () => {
    // Given the same assembly, a Role that may not make Buckets, and one that
    // may.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws({
      defaultAccountId: accountId,
      defaultRegionName: "eu-west-2",
    });
    const reader = await deployRole(
      simAws,
      accountId,
      "reader",
      "s3:GetObject",
    );
    const deployer = await deployRole(simAws, accountId, "deployer", "s3:*");
    const directory = await simCdkCloudAssemblyFactory.make({
      stacks: [{ artifactId: "SiteStack", regionName: "eu-west-2" }],
    });

    // When the assembly names the first and the Stack names the second.
    await simAws.cloudFormation().deployCdkOut({
      directoryPath: directory.join("cdk.out"),
      caller: reader,
      stackOptions: { SiteStack: { caller: deployer } },
    });

    // Then the Stack deployed, so it ran as the caller keyed against it.
    assertNonNullable(
      simAws.s3().getSimBucketByName(assemblyStackBucketName("SiteStack")),
    );
  });
});

function bucketResource(bucketName: string): object {
  return {
    Type: "AWS::S3::Bucket",
    Properties: { BucketName: bucketName },
  };
}

/**
 * A Role a deployment can run as, allowed the actions it is given.
 */
async function deployRole(
  simAws: SimAws,
  accountId: SimAwsAccountId,
  roleName: string,
  action: string | readonly string[],
): Promise<SimAwsCaller> {
  const iam = simAws.account(accountId).iam();

  await iam.createRole({
    input: {
      RoleName: roleName,
      AssumeRolePolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Principal: { Service: "cloudformation.amazonaws.com" },
        },
      }),
    },
  });

  await iam.putRolePolicy({
    input: {
      RoleName: roleName,
      PolicyName: `${roleName}-policy`,
      PolicyDocument: jsonStringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: action, Resource: "*" },
      }),
    },
  });

  return { kind: "arn", arn: `arn:aws:iam::${accountId}:role/${roleName}` };
}
