import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimStatesTagInput } from "../../machine/sim-state-machine-tag.js";

describe("What tagging a simulated state machine refuses", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  const done = { StartAt: "Done", States: { Done: { Type: "Succeed" } } };

  /**
   * A state machine to tag.
   */
  async function createWorkflow(simAws: SimAws): Promise<string> {
    const created = await simAws.stepFunctions().createStateMachine({
      input: { name: "Enrolment", roleArn, definition: JSON.stringify(done) },
    });

    return created.stateMachineArn;
  }

  /**
   * Whatever tagging a state machine with these was refused with.
   */
  async function refusalFrom(
    tags: readonly SimStatesTagInput[],
  ): Promise<Error> {
    const simAws = new SimAws();
    const resourceArn = await createWorkflow(simAws);

    return await assertThrowsErrorAsync(async () => {
      await simAws
        .stepFunctions()
        .tagResource({ input: { resourceArn, tags } });
    });
  }

  it("refuses a tag with no key", async () => {
    // When a request carries a tag naming nothing.
    const error = await refusalFrom([{ value: "enrolment" }]);

    // Then it is refused as a validation failure, the way Step Functions
    // refuses a request it cannot read.
    assertIdentical(error.name, "ValidationException");
    assertStringIncludes(error.message, "a key of at least one character");
  });

  it("refuses a tag with no value", async () => {
    // When a request carries a key with no value at all. An empty value is
    // allowed, an absent one is not.
    const error = await refusalFrom([{ key: "team" }]);

    assertStringIncludes(error.message, "requires a value, which may be empty");
  });

  it("refuses a key longer than a tag key runs", async () => {
    // When a key runs past 128 characters.
    const error = await refusalFrom([{ key: "t".repeat(129), value: "yes" }]);

    assertStringIncludes(error.message, "129 characters, where 128");
  });

  it("refuses a value longer than a tag value runs", async () => {
    // When a value runs past 256 characters.
    const error = await refusalFrom([{ key: "team", value: "e".repeat(257) }]);

    assertStringIncludes(error.message, "257 characters, where 256");
  });

  it("refuses a key under the prefix AWS assigns its own tags", async () => {
    // When a caller writes a key beginning aws:.
    const error = await refusalFrom([
      { key: "aws:cloudformation:stack-name", value: "enrolment" },
    ]);

    assertStringIncludes(error.message, "reserved aws: prefix");
  });

  it("refuses a character a tag is not written with", async () => {
    // When a key holds a character outside the set Step Functions takes.
    const error = await refusalFrom([{ key: "team!", value: "enrolment" }]);

    assertStringIncludes(error.message, "a character a tag does not take");
  });

  it("refuses a request that would push a resource past 50 tags", async () => {
    // Given a state machine already carrying 50 tags.
    const simAws = new SimAws();
    const resourceArn = await createWorkflow(simAws);
    await simAws.stepFunctions().tagResource({
      input: {
        resourceArn,
        tags: Array.from({ length: 50 }, (_unused, index) => ({
          key: `tag-${index.toString()}`,
          value: "yes",
        })),
      },
    });

    // When one more key is added.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.stepFunctions().tagResource({
        input: { resourceArn, tags: [{ key: "one-too-many", value: "yes" }] },
      });
    });

    // Then the request is refused as TooManyTags, and the 50 that were there
    // are left as they were.
    assertIdentical(error.name, "TooManyTags");
    const listed = await simAws
      .stepFunctions()
      .listTagsForResource({ input: { resourceArn } });
    assertArrayLength(listed.tags, 50);
  });

  it("refuses an ARN naming no state machine", async () => {
    // Given a simulation holding one state machine.
    const simAws = new SimAws();
    await createWorkflow(simAws);

    // When a request names a state machine that is not there.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.stepFunctions().listTagsForResource({
        input: {
          resourceArn:
            "arn:aws:states:us-east-1:123456789012:stateMachine:Absent",
        },
      });
    });

    // Then it is ResourceNotFound, which is what the tag commands answer with
    // rather than the StateMachineDoesNotExist that DescribeStateMachine gives.
    assertIdentical(error.name, "ResourceNotFound");
  });

  it("refuses an ARN that names no state machine at all", async () => {
    // When a request names an execution rather than a state machine.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.stepFunctions().untagResource({
        input: {
          resourceArn:
            "arn:aws:states:us-east-1:123456789012:execution:Enrolment:1",
          tagKeys: ["team"],
        },
      });
    });

    // Then it is refused as an ARN naming nothing this simulation tags. A
    // state machine is the only Step Functions resource that holds tags here.
    assertIdentical(error.name, "InvalidArn");
    assertStringIncludes(error.message, "is not a state machine ARN");
  });

  it("refuses a request with no resourceArn", async () => {
    // When a request names nothing to tag.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.stepFunctions().tagResource({ input: {} });
    });

    assertStringIncludes(error.message, "TagResource needs a resourceArn");
  });

  it("leaves the tags a resource had when it refuses a request", async () => {
    // Given a state machine carrying one tag.
    const simAws = new SimAws();
    const resourceArn = await createWorkflow(simAws);
    await simAws.stepFunctions().tagResource({
      input: { resourceArn, tags: [{ key: "team", value: "enrolment" }] },
    });

    // When a request carrying a good tag and a bad one is refused.
    await assertThrowsErrorAsync(async () => {
      await simAws.stepFunctions().tagResource({
        input: {
          resourceArn,
          tags: [
            { key: "term", value: "autumn" },
            { key: "aws:owner", value: "nobody" },
          ],
        },
      });
    });

    // Then neither landed. The whole request is read before anything is kept.
    const listed = await simAws
      .stepFunctions()
      .listTagsForResource({ input: { resourceArn } });
    assertArrayEquals(
      listed.tags.map((tag) => tag.key),
      ["team"],
    );
  });
});
