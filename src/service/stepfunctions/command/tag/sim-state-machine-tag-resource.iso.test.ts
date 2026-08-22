import {
  ListTagsForResourceCommand,
  SFNClient,
  TagResourceCommand,
} from "@aws-sdk/client-sfn";
import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimSdk } from "../../../../sdk/index.js";
import type { SimStatesTagInput } from "../../machine/sim-state-machine-tag.js";

describe("Tagging a simulated state machine", () => {
  const roleArn = "arn:aws:iam::123456789012:role/EnrolmentWorkflowRole";

  const done = {
    StartAt: "Done",
    States: { Done: { Type: "Succeed" } },
  };

  /**
   * A state machine, with whatever tags a caller created it with.
   */
  async function createWorkflow(
    simAws: SimAws,
    tags?: readonly SimStatesTagInput[],
  ): Promise<string> {
    const created = await simAws.stepFunctions().createStateMachine({
      input: {
        name: "Enrolment",
        roleArn,
        definition: JSON.stringify(done),
        ...(tags !== undefined && { tags }),
      },
    });

    return created.stateMachineArn;
  }

  /**
   * The tags a state machine holds, written as `key=value` so a whole list
   * compares in one assertion.
   */
  async function tagsOf(
    simAws: SimAws,
    resourceArn: string,
  ): Promise<readonly string[]> {
    const listed = await simAws
      .stepFunctions()
      .listTagsForResource({ input: { resourceArn } });

    return written(listed.tags);
  }

  /**
   * Tags as `key=value`, in the order they were listed.
   */
  function written(
    tags: readonly SimStatesTagInput[] | undefined,
  ): readonly string[] {
    return (tags ?? []).map((tag) => `${tag.key ?? ""}=${tag.value ?? ""}`);
  }

  it("carries the tags CreateStateMachine was given", async () => {
    // Given a state machine created with two tags.
    const simAws = new SimAws();
    const stateMachineArn = await createWorkflow(simAws, [
      { key: "team", value: "enrolment" },
      { key: "cost-centre", value: "1042" },
    ]);

    // When its tags are listed.
    const tags = await tagsOf(simAws, stateMachineArn);

    // Then both are there, ordered by key.
    assertArrayEquals(tags, ["cost-centre=1042", "team=enrolment"]);
  });

  it("holds no tags for a state machine created without any", async () => {
    // Given a state machine created with no tags at all.
    const simAws = new SimAws();
    const stateMachineArn = await createWorkflow(simAws);

    // When its tags are listed.
    const tags = await tagsOf(simAws, stateMachineArn);

    // Then the list is empty rather than absent.
    assertArrayEquals(tags, []);
  });

  it("replaces the value of a key TagResource names again", async () => {
    // Given a state machine carrying a tag.
    const simAws = new SimAws();
    const stateMachineArn = await createWorkflow(simAws, [
      { key: "team", value: "enrolment" },
    ]);

    // When the same key is tagged with another value, alongside a new key.
    await simAws.stepFunctions().tagResource({
      input: {
        resourceArn: stateMachineArn,
        tags: [
          { key: "team", value: "admissions" },
          { key: "term", value: "" },
        ],
      },
    });

    // Then the key is held once, with the value the second request gave. An
    // empty value is a label with nothing to say about it.
    assertArrayEquals(await tagsOf(simAws, stateMachineArn), [
      "team=admissions",
      "term=",
    ]);
  });

  it("takes off the keys UntagResource names", async () => {
    // Given a state machine carrying two tags.
    const simAws = new SimAws();
    const stateMachineArn = await createWorkflow(simAws, [
      { key: "team", value: "enrolment" },
      { key: "term", value: "autumn" },
    ]);

    // When one of them is taken off, alongside a key that was never there.
    await simAws.stepFunctions().untagResource({
      input: { resourceArn: stateMachineArn, tagKeys: ["term", "absent"] },
    });

    // Then the other tag is left, and the key that was never there is not an
    // error. UntagResource asks for a state rather than for a change.
    assertArrayEquals(await tagsOf(simAws, stateMachineArn), [
      "team=enrolment",
    ]);
  });

  it("reaches the same tags through an intercepted SFNClient", async () => {
    // Given a state machine and an SFN client the simulator intercepts.
    const simAws = new SimAws();
    const stateMachineArn = await createWorkflow(simAws);
    const client = new SFNClient({ region: simAws.defaultRegionName });

    using _intercepted = new SimSdk({ simAws }).intercept(client);

    // When the SDK tags it and lists the tags back.
    await client.send(
      new TagResourceCommand({
        resourceArn: stateMachineArn,
        tags: [{ key: "team", value: "enrolment" }],
      }),
    );
    const listed = await client.send(
      new ListTagsForResourceCommand({ resourceArn: stateMachineArn }),
    );

    // Then the SDK caller and the simulator are looking at one state machine.
    assertArrayEquals(written(listed.tags), ["team=enrolment"]);
    assertIdentical(
      simAws.stepFunctions().findStateMachine("Enrolment")?.tags.ordered()
        .length,
      1,
    );
  });
});
