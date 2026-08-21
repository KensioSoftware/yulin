import {
  assertArrayLength,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../template/value/sim-cfn-template-value.js";
import type { SimCfnDeployedStack } from "../../../stack/sim-cfn-deployed-stack.type.js";
import {
  samFunctionTemplateLogicalId,
  simCfnSamFunctionTemplateFactory,
} from "../sim-cfn-sam-function-template.factory.js";

/**
 * Deploy a SAM function carrying the given `Events` section, whatever shape it
 * is in.
 */
async function deployedEvents(
  stackName: string,
  events: SimCfnTemplateValueRecord,
  resources: SimCfnTemplateValueRecord = {},
): Promise<SimCfnDeployedStack> {
  const stack = await new SimAws().cloudFormation().deployTemplate({
    stackName,
    template: simCfnSamFunctionTemplateFactory.make({
      functionProperties: { Events: events },
      resources,
    }),
  });
  await stack.waitForDeployComplete();

  return stack;
}

describe("SAM function events the expansion cannot read", () => {
  it("leaves the function as it is for an event that is not an object", async () => {
    // Given a function whose event is a bare string, which is not what an
    // event is written as

    // When it is deployed
    const stack = await deployedEvents("stringly-stack", { Work: "SQS" });

    // Then the function deployed with nothing in front of it, rather than the
    // deployment failing over an event nothing can read
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertArrayLength(stack.skippedResources, 0);
  });

  it("leaves the function as it is for an event naming no Type", async () => {
    // Given an event stating properties and no type to read them as
    const stack = await deployedEvents("typeless-stack", {
      Work: { Properties: { Queue: "arn:aws:sqs:us-east-1:1:orders" } },
    });

    // Then the function deployed on its own
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertArrayLength(stack.skippedResources, 0);
  });

  it("leaves the function as it is for an event stating no Properties", async () => {
    // Given an event of a type this expands, stating nothing for it to expand
    const stack = await deployedEvents("propertyless-stack", {
      Work: { Type: "SQS" },
    });

    // Then the function deployed with nothing polling for it
    assertNonNullable(stack.getResource(samFunctionTemplateLogicalId));
    assertUndefined(
      stack.getResource(
        `${samFunctionTemplateLogicalId}WorkEventSourceMapping`,
      ),
    );
    assertArrayLength(stack.skippedResources, 0);
  });

  it("changes nothing for an event naming a Resource the template lacks", async () => {
    // Given an S3 event naming a Bucket the template never declares
    const stack = await deployedEvents("absent-bucket-stack", {
      Upload: {
        Type: "S3",
        Properties: { Bucket: "Missing", Events: "s3:ObjectCreated:*" },
      },
    });

    // Then the permission the event brought was deployed and there was
    // nothing to notify
    assertNonNullable(
      stack.getResource(`${samFunctionTemplateLogicalId}UploadS3Permission`),
    );
    assertUndefined(stack.getResource("Missing"));
    assertArrayLength(stack.skippedResources, 0);
  });
});
