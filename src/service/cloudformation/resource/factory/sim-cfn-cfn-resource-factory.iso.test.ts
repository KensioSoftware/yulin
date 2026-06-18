import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCloudFormationResourceCreateContext } from "../sim-cfn-resource.js";
import { SimCfnResource } from "../sim-cfn-resource.js";
import {
  SimCfnCfnResourceFactory,
  SimCloudFormationWaitConditionHandle,
} from "./sim-cfn-cfn-resource-factory.js";
import type { SimAwsAccountId } from "../../../aws/sim-aws-account.js";
import { BackgroundTasks } from "../../../../util/background/background.js";

describe("SimCfnCfnResourceFactory", () => {
  it("creates a WaitConditionHandle resource", async () => {
    // Given a CloudFormation Resource factory and a WaitConditionHandle Resource.
    const background = new BackgroundTasks();
    const simAws = new SimAws({ background });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleHandle",
      template: {
        Type: "AWS::CloudFormation::WaitConditionHandle",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      background,
      resources: new Map(),
    };
    const factory = new SimCfnCfnResourceFactory();

    // When the WaitConditionHandle resource type is created.
    const simResource = await factory.create(
      "WaitConditionHandle",
      resource,
      context,
    );

    // Then a simulated WaitConditionHandle is returned for the same Resource.
    assertInstanceOf(simResource, SimCloudFormationWaitConditionHandle);
    assertIdentical(simResource.resource, resource);
  });

  it("rejects unsupported CloudFormation resource types", async () => {
    // Given a CloudFormation Resource factory and an unsupported Resource type.
    const background = new BackgroundTasks();
    const simAws = new SimAws({ background });
    const resource = new SimCfnResource({
      accountRegionScope: {
        accountId: "111111111111" as SimAwsAccountId,
        regionName: "eu-west-2",
      },
      logicalId: "ExampleUnsupportedResource",
      template: {
        Type: "AWS::CloudFormation::UnsupportedResource",
      },
    });
    const context: SimCloudFormationResourceCreateContext = {
      simAws,
      background,
      resources: new Map(),
    };
    const factory = new SimCfnCfnResourceFactory();

    // When creation is attempted, then it rejects with an unsupported Resource
    // type error.
    const error = await assertThrowsErrorAsync(async () =>
      factory.create("UnsupportedResource", resource, context),
    );

    // Then the unsupported Resource type name is included for diagnosis.
    assertIdentical(
      error.message,
      "Unsupported sim CloudFormation CloudFormation Resource UnsupportedResource",
    );
  });
});
