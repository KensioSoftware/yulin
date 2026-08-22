import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCfnDeployedResource } from "../../cloudformation/resource/sim-cfn-deployed-resource.type.js";
import type { SimCfnDeployedStack } from "../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import {
  deployedResourceObject,
  deployedStackObject,
} from "../../cloudformation/stack/sim-cfn-stack.fixture.js";
import { simCfnKinesisResourceCreation } from "./sim-cfn-kinesis-resource-error.js";

/**
 * A deployed stream, the stack that holds it and the simulation it is in.
 */
async function deployedStream(): Promise<{
  readonly simAws: SimAws;
  readonly stack: SimCfnDeployedStack;
  readonly resource: SimCfnDeployedResource;
}> {
  const simAws = new SimAws();
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: {
      Resources: {
        OrdersStream: {
          Type: "AWS::Kinesis::Stream",
          Properties: { Name: "orders" },
        },
      },
    },
  });
  await stack.waitForDeployComplete();

  const resource = stack.getResource("OrdersStream");
  assertNonNullable(resource);

  return { simAws, stack, resource };
}

describe("What the simulated Kinesis CloudFormation factory refuses", () => {
  it("refuses creating a Kinesis Resource type it does not simulate", async () => {
    // Given a deployed stream, and the factory that made it.
    const { simAws, stack, resource } = await deployedStream();

    // When the factory is asked for a stream consumer, which is enhanced
    // fan-out.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .cfnResourceFactory()
        .create("StreamConsumer", deployedResourceObject(resource), {
          simAws,
          resources: deployedStackObject(stack).resourceMap,
        });
    });

    // Then it says so, which sim CloudFormation records and steps over.
    assertStringIncludes(
      error.message,
      "Unsupported sim Kinesis CloudFormation Resource StreamConsumer",
    );
  });

  it("refuses deleting a Kinesis Resource type it never creates", async () => {
    // Given a deployed stream, and the factory that made it.
    const { simAws, stack, resource } = await deployedStream();

    // When the factory is asked to delete a resource policy.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .cfnResourceFactory()
        .delete("ResourcePolicy", deployedResourceObject(resource), {
          simAws,
          resources: deployedStackObject(stack).resourceMap,
        });
    });

    // Then it says so.
    assertStringIncludes(
      error.message,
      "Unsupported sim Kinesis CloudFormation Resource ResourcePolicy deletion",
    );
  });

  it("passes through an error that did not come from simulated Kinesis", async () => {
    // Given a creation that fails for a reason of its own.
    const thrown = new TypeError("the template reader broke");

    // When it runs inside the wrapper that renames Kinesis refusals.
    const error = await assertThrowsErrorAsync(async () => {
      await simCfnKinesisResourceCreation(
        "AWS::Kinesis::Stream",
        "OrdersStream",
        () => Promise.reject(thrown),
      );
    });

    // Then it comes back as it was, since only Kinesis's own refusals are
    // reworded to name the Resource.
    assertIdentical(error, thrown);
  });
});
