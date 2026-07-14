import {
  CreateDistributionCommand,
  GetDistributionCommand,
} from "@aws-sdk/client-cloudfront";
import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { SimCloudFront } from "../../sim-cloudfront.js";

describe("CloudFront CreateDistributionCommand IAM authorization", () => {
  it("allows the default Account root caller and registers the Distribution", async () => {
    // Given CloudFront in a known simulated AWS Account.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();

    // When a Distribution is created without an explicit caller.
    const createOutput = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "root-created-distribution",
          Comment: "Created by the Account root caller",
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
    assertNonNullable(createOutput.Distribution?.Id);

    const getOutput = await simCloudFront.getDistribution(
      new GetDistributionCommand({
        Id: createOutput.Distribution.Id,
      }),
    );

    // Then IAM defaults to Account root and CloudFront registers the Distribution.
    assertIdentical(getOutput.Distribution?.Id, createOutput.Distribution.Id);
  });

  it("allows a Role when its action, wildcard resource, and principal condition match", async () => {
    // Given a Role conditionally allowed to create CloudFront Distributions.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionalDistributionCreator",
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
        RoleName: "ConditionalDistributionCreator",
        PolicyName: "CreateConditionalDistribution",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "cloudfront:CreateDistribution",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": roleArn,
              },
            },
          },
        }),
      }),
    );

    // When the Role creates a Distribution through the CloudFront boundary.
    const output = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "role-created-distribution",
          Comment: "Created by a conditionally authorized Role",
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
      {
        caller: { kind: "arn", arn: roleArn },
      },
    );

    // Then IAM permits the request and CloudFront creates the Distribution.
    assertNonNullable(output.Distribution?.Id);
    assertMapSize(simCloudFront.getDistributions(), 1);
  });

  it("implicitly denies a Role when its principal condition does not match", async () => {
    // Given a Role with a CreateDistribution policy conditioned on another Role.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simIam = simAws.account(accountId).iam();
    const simCloudFront = simAws.account(accountId).cloudFront();

    const createRoleOutput = await simIam.createRole(
      new CreateRoleCommand({
        RoleName: "ConditionMismatchDistributionCreator",
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
        RoleName: "ConditionMismatchDistributionCreator",
        PolicyName: "MismatchedPrincipal",
        PolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Action: "cloudfront:CreateDistribution",
            Resource: "*",
            Condition: {
              StringEquals: {
                "aws:PrincipalArn": `arn:aws:iam::${accountId}:role/AnotherRole`,
              },
            },
          },
        }),
      }),
    );

    // When the Role attempts to create an otherwise valid Distribution.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.createDistribution(
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
        {
          caller: { kind: "arn", arn: roleArn },
        },
      ),
    );

    // Then IAM denies the wildcard-resource operation before CloudFront allocates state.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "cloudfront:CreateDistribution");
    assertIdentical(error.resource, "*");
    assertMapSize(simCloudFront.getDistributions(), 0);
  });

  it("does not apply the Account root fallback to an anonymous caller", async () => {
    // Given CloudFront in an Account where an omitted caller would be Account root.
    const accountId = makeSimAwsAccountId();
    const simAws = new SimAws();
    const simCloudFront = simAws.account(accountId).cloudFront();

    // When an anonymous caller attempts to create a Distribution.
    const error = await assertThrowsErrorAsync(async () =>
      simCloudFront.createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: {
            CallerReference: "anonymous-denied-distribution",
            Comment: "Anonymous caller",
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
        {
          caller: { kind: "anonymous" },
        },
      ),
    );

    // Then IAM preserves anonymity, denies the request, and CloudFront retains no state.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.caller.kind, "anonymous");
    assertIdentical(error.$metadata.httpStatusCode, 403);
    assertMapSize(simCloudFront.getDistributions(), 0);
  });

  it("uses allow-all authorization when SimCloudFront is instantiated directly", async () => {
    // Given standalone CloudFront with no supplied IAM implementation.
    const simCloudFront = new SimCloudFront();

    // When an anonymous caller creates a Distribution through the standalone service.
    const output = await simCloudFront.createDistribution(
      new CreateDistributionCommand({
        DistributionConfig: {
          CallerReference: "standalone-distribution",
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
      {
        caller: { kind: "anonymous" },
      },
    );

    // Then the allow-all fallback permits creation and CloudFront retains the Distribution.
    assertNonNullable(output.Distribution?.Id);
    assertMapSize(simCloudFront.getDistributions(), 1);
  });
});
