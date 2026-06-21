import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsAccountRegionScope } from "../../../../aws/sim-aws-account-region-scope.js";
import { SimAws } from "../../../../aws/sim-aws.js";
import { SimCfnCfnResourceFactory } from "../../factory/sim-cfn-cfn-resource-factory.js";
import { resolveSimCloudFormationServiceResourceFactory } from "./sim-cfn-service-resolver.js";
import type { SimAwsAccountId } from "../../../../aws/sim-aws-account.js";

describe("resolveSimCloudFormationServiceResourceFactory", () => {
  it("resolves the CloudFormation Resource factory", () => {
    // Given a parsed AWS::CloudFormation Resource type in a scoped SimAws.
    const simAws = new SimAws();
    const accountRegionScope: SimAwsAccountRegionScope = {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    };

    // When the service Resource factory is resolved.
    const factory = resolveSimCloudFormationServiceResourceFactory(
      simAws,
      accountRegionScope,
      {
        providerName: "AWS",
        serviceName: "CloudFormation",
        resourceTypeName: "WaitConditionHandle",
      },
    );

    // Then the CloudFormation-specific factory is returned.
    assertInstanceOf(factory, SimCfnCfnResourceFactory);
  });

  it("resolves the S3 Resource factory in the requested Account and Region scope", () => {
    // Given a parsed AWS::S3 Resource type and an explicit Account/Region scope.
    const simAws = new SimAws();
    const accountRegionScope: SimAwsAccountRegionScope = {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    };
    const scopedAws = simAws.accountRegionScope(
      accountRegionScope.accountId,
      accountRegionScope.regionName,
    );

    // When the service Resource factory is resolved.
    const factory = resolveSimCloudFormationServiceResourceFactory(
      simAws,
      accountRegionScope,
      {
        providerName: "AWS",
        serviceName: "S3",
        resourceTypeName: "Bucket",
      },
    );

    // Then the factory comes from the S3 service for that exact scope.
    assertIdentical(factory, scopedAws.s3().cfnResourceFactory());
  });

  it("rejects unsupported Resource providers", () => {
    // Given a parsed Resource type with a provider other than AWS.
    const simAws = new SimAws();
    const accountRegionScope: SimAwsAccountRegionScope = {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    };

    // When resolution is attempted, then it throws an unsupported provider error.
    const error = assertThrowsError(() =>
      resolveSimCloudFormationServiceResourceFactory(
        simAws,
        accountRegionScope,
        {
          providerName: "Custom",
          serviceName: "S3",
          resourceTypeName: "Bucket",
        },
      ),
    );

    // Then the unsupported provider name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFormation Custom Resource Bucket",
    );
  });

  it("rejects unsupported AWS Resource services", () => {
    // Given a parsed AWS Resource type for a service with no sim factory.
    const simAws = new SimAws();
    const accountRegionScope: SimAwsAccountRegionScope = {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    };

    // When resolution is attempted, then it throws an unsupported service error.
    const error = assertThrowsError(() =>
      resolveSimCloudFormationServiceResourceFactory(
        simAws,
        accountRegionScope,
        {
          providerName: "AWS",
          serviceName: "DynamoDB",
          resourceTypeName: "Table",
        },
      ),
    );

    // Then the unsupported service name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFormation Resource service DynamoDB",
    );
  });

  it("rejects non-AWS and non-Custom Resource providers", () => {
    // Given a parsed Resource type with a provider other than AWS or Custom.
    const simAws = new SimAws();
    const accountRegionScope: SimAwsAccountRegionScope = {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    };

    // When resolution is attempted, then it throws an unsupported provider error.
    const error = assertThrowsError(() =>
      resolveSimCloudFormationServiceResourceFactory(
        simAws,
        accountRegionScope,
        {
          providerName: "ThirdParty",
          serviceName: "S3",
          resourceTypeName: "Bucket",
        },
      ),
    );

    // Then the unsupported provider name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFormation Resource provider ThirdParty",
    );
  });

  it("rejects invalid namespaced Custom CDK BucketDeployment Resource types", () => {
    // Given a parsed 3-part Custom Resource type that only ends with CDKBucketDeployment.
    const simAws = new SimAws();
    const accountRegionScope: SimAwsAccountRegionScope = {
      accountId: "111111111111" as SimAwsAccountId,
      regionName: "eu-west-2",
    };

    // When resolution is attempted, then it is not accepted as Custom::CDKBucketDeployment.
    const error = assertThrowsError(() =>
      resolveSimCloudFormationServiceResourceFactory(
        simAws,
        accountRegionScope,
        {
          providerName: "Custom",
          serviceName: "Anything",
          resourceTypeName: "CDKBucketDeployment",
        },
      ),
    );

    // Then the resource is rejected as an unsupported Custom Resource.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFormation Custom Resource CDKBucketDeployment",
    );
  });
});
