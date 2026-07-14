import {
  CreateDistributionCommand,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimCloudFront } from "../../sim-cloudfront.js";

describe("CloudFront GetDistributionCommand IAM authorization", () => {
  it("allows the default Account root caller to retrieve a Distribution", async () => {
    // Given a Distribution created in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();

    const createOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "root-readable-distribution",
          Comment: "Readable by Account root",
          Enabled: true,
          Origins: {
            Quantity: 0,
            Items: [],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
            TrustedSigners: {
              Enabled: false,
              Quantity: 0,
            },
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: "none",
              },
            },
            MinTTL: 0,
          },
        },
      }),
    );
    const createdDistribution = createOutput.Distribution;
    assertNonNullable(createdDistribution);
    assertNonNullable(createdDistribution.Id);

    // When GetDistribution is called without an explicit caller.
    const output = await simCloudFront.getDistribution(
      new GetDistributionCommand({
        Id: createdDistribution.Id,
      }),
    );

    // Then IAM defaults to Account root and CloudFront returns the Distribution.
    assertIdentical(output.Distribution?.Id, createdDistribution.Id);
  });

  it("allows a Role when its action, Distribution ARN, and principal condition match", async () => {
    // Given a Distribution and a Role conditionally allowed to retrieve it.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();

    const createOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "conditional-readable-distribution",
          Comment: "Readable by a conditional Role",
          Enabled: true,
          Origins: {
            Quantity: 0,
            Items: [],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
            TrustedSigners: {
              Enabled: false,
              Quantity: 0,
            },
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: "none",
              },
            },
            MinTTL: 0,
          },
        },
      }),
    );
    const createdDistribution = createOutput.Distribution;
    assertNonNullable(createdDistribution);
    assertNonNullable(createdDistribution.Id);
    assertNonNullable(createdDistribution.ARN);

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalDistributionReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionalDistributionReader",
        PolicyName: "ReadConditionalDistribution",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "cloudfront:GetDistribution",
            Resource: createdDistribution.ARN,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role gets the Distribution named by its policy.
    const output = await simCloudFront.getDistribution(
      new GetDistributionCommand({
        Id: createdDistribution.Id,
      }),
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the ARN and CloudFront returns the matching Distribution.
    assertIdentical(output.Distribution?.ARN, createdDistribution.ARN);
  });

  it("implicitly denies a Role when its principal condition does not match", async () => {
    // Given a Distribution and a Role policy conditioned on another principal ARN.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();

    const createOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "condition-denied-distribution",
          Comment: "Denied by a principal condition",
          Enabled: true,
          Origins: {
            Quantity: 0,
            Items: [],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
            TrustedSigners: {
              Enabled: false,
              Quantity: 0,
            },
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: "none",
              },
            },
            MinTTL: 0,
          },
        },
      }),
    );
    const createdDistribution = createOutput.Distribution;
    assertNonNullable(createdDistribution);
    assertNonNullable(createdDistribution.Id);
    assertNonNullable(createdDistribution.ARN);

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchDistributionReader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: {
              AWS: `arn:aws:iam::${accountId}:root`,
            },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const roleArn = createRoleOutput.Role.Arn;

    await simIam.putRolePolicy(
      new PutRolePolicyCommand({
        RoleName: "ConditionMismatchDistributionReader",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "cloudfront:GetDistribution",
            Resource: createdDistribution.ARN,
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role requests the otherwise authorized Distribution.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.getDistribution(
        new GetDistributionCommand({
          Id: createdDistribution.Id,
        }),
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the exact GetDistribution action and Distribution ARN.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:GetDistribution");
    assertIdentical(error.resource, createdDistribution.ARN);
  });

  it("does not reveal a missing Distribution to an anonymous caller", async () => {
    // Given CloudFront in an Account where an omitted caller would be Account root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();
    const missingDistributionId = "EMISSINGDISTRIB";

    // When an anonymous caller requests a Distribution ID that does not exist.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.getDistribution(
        new GetDistributionCommand({
          Id: missingDistributionId,
        }),
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM denies before CloudFront can reveal that the Distribution is absent.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(
      error.resource,
      `arn:aws:cloudfront::${accountId}:distribution/${missingDistributionId}`,
    );
  });

  it("uses allow-all authorization when SimCloudFront is instantiated directly", async () => {
    // Given standalone CloudFront with no supplied IAM implementation.
    const simCloudFront = new SimCloudFront();

    const createOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "standalone-readable-distribution",
          Comment: "Standalone CloudFront",
          Enabled: true,
          Origins: {
            Quantity: 0,
            Items: [],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "origin-a",
            ViewerProtocolPolicy: "allow-all",
            TrustedSigners: {
              Enabled: false,
              Quantity: 0,
            },
            ForwardedValues: {
              QueryString: false,
              Cookies: {
                Forward: "none",
              },
            },
            MinTTL: 0,
          },
        },
      }),
    );
    const createdDistribution = createOutput.Distribution;
    assertNonNullable(createdDistribution);
    assertNonNullable(createdDistribution.Id);

    // When an anonymous caller gets the Distribution through standalone CloudFront.
    const output = await simCloudFront.getDistribution(
      new GetDistributionCommand({
        Id: createdDistribution.Id,
      }),
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits the request and returns the Distribution.
    assertIdentical(output.Distribution?.Id, createdDistribution.Id);
  });
});
