import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimAwsAccountId } from "../../aws/sim-aws-account.js";
import type { SimCloudFormationResourceCreateContext } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";
import { SimCloudFrontCloudFormationResourceFactory } from "./sim-cfn-cloudfront-resource-factory.js";
import { simCfDistroConfigFactory } from "../distribution/sim-cf-distro-config.factory.js";

describe("SimCloudFrontCloudFormationResourceFactory", () => {
  it("creates a CloudFront Distribution", async () => {
    // Given a CloudFront CloudFormation Resource factory and a Distribution
    // resource.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    await simAws.s3().createBucket({
      input: {
        Bucket: "example-bucket",
      },
    });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "SiteDistribution",
      template: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: simCfDistroConfigFactory.make({
            Aliases: {
              Items: ["www.example.test"],
            },
          }),
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When the Distribution resource type is created.
    const distribution = await factory.create(
      "Distribution",
      resource,
      context,
    );

    // Then a simulated Distribution is created and returned.
    assertInstanceOf(distribution, SimCloudFrontDistribution);
    assertTrue(distribution.hasAlternateDomainName("www.example.test"));
    assertIdentical(distribution.status, "Deploying");
    assertIdentical(
      cloudFront.getSimDistributionById(distribution.distributionId),
      distribution,
    );
  });

  it("creates a CloudFront Distribution from resolved properties", async () => {
    // Given a Distribution resource whose original template properties differ from
    // the resolved CloudFormation properties supplied in the creation context.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    await simAws.s3().createBucket({
      input: {
        Bucket: "example-bucket",
      },
    });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ResolvedSiteDistribution",
      template: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: simCfDistroConfigFactory.make({
            Aliases: {
              Items: ["unresolved.example.test"],
            },
          }),
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
      resolvedProperties: {
        DistributionConfig: simCfDistroConfigFactory.make({
          Aliases: {
            Items: ["resolved.example.test"],
          },
        }),
      },
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When the Distribution resource type is created.
    const distribution = await factory.create(
      "Distribution",
      resource,
      context,
    );

    // Then the resolved properties are used for creation.
    assertInstanceOf(distribution, SimCloudFrontDistribution);
    assertTrue(distribution.hasAlternateDomainName("resolved.example.test"));
  });

  it("rejects unsupported CloudFront resource types", async () => {
    // Given a CloudFront CloudFormation Resource factory and an unsupported
    // Resource type.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleUnsupportedResource",
      template: {
        Type: "AWS::CloudFront::UnsupportedResource",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When creation is attempted, then it rejects with an unsupported Resource
    // type error.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("UnsupportedResource", resource, context),
    );

    // Then the unsupported Resource type name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFront CloudFormation Resource UnsupportedResource",
    );
  });

  it("rejects a Distribution with a non-object DistributionConfig", async () => {
    // Given a CloudFront CloudFormation Resource factory and a Distribution
    // resource whose DistributionConfig cannot be passed to sim CloudFront.
    const simAws = new SimAws();
    const cloudFront = simAws.cloudFront();
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "InvalidDistribution",
      template: {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: "not-an-object",
        },
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      resources: new Map(),
    };
    const factory = new SimCloudFrontCloudFormationResourceFactory(cloudFront);

    // When creation is attempted, then the DistributionConfig shape assertion
    // rejects it.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("Distribution", resource, context),
    );

    assertNonNullable(error);
    assertIdentical(
      error.message,
      "Invalid AWS::CloudFront::Distribution InvalidDistribution: DistributionConfig must be an object",
    );
  });
});
