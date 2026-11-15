import {
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../../iam/role/sim-iam-role-with-policy.factory.js";

/**
 * Create a stream carrying the tags given, as the caller given.
 */
async function createStream(
  simAws: SimAws,
  StreamName: string,
  Tags: Readonly<Record<string, string>>,
  caller: SimAwsCaller,
): Promise<unknown> {
  return simAws
    .kinesis()
    .createStream({ input: { StreamName, ShardCount: 1, Tags } }, { caller });
}

describe("sim Kinesis CreateStream tags", () => {
  it("needs kinesis:AddTagsToStream to create a stream with tags", async () => {
    // Given a caller allowed to create streams, and one also allowed
    // kinesis:TagResource, which does not count
    const simAws = new SimAws();
    const createOnly = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "CreateOnly",
        actions: ["kinesis:CreateStream", "kinesis:TagResource"],
      },
      simAws,
    );
    const tagging = await simIamRoleWithPolicyFactory.make(
      {
        roleName: "Tagging",
        actions: ["kinesis:CreateStream", "kinesis:AddTagsToStream"],
      },
      simAws,
    );
    const tags = { team: "orders" };

    // When the first creates an untagged stream and a tagged one, and the
    // second a tagged one
    await createStream(
      simAws,
      "plain",
      {},
      { kind: "arn", arn: createOnly.Arn },
    );
    const error = await assertThrowsErrorAsync(async () =>
      createStream(simAws, "refused", tags, {
        kind: "arn",
        arn: createOnly.Arn,
      }),
    );
    await createStream(simAws, "tagged", tags, {
      kind: "arn",
      arn: tagging.Arn,
    });

    // Then only the tagged stream created without AddTagsToStream is refused
    assertInstanceOf(error, SimIamAccessDenied);
    assertNonNullable(simAws.kinesis().findStream("plain"));
    assertUndefined(simAws.kinesis().findStream("refused"));
    assertNonNullable(simAws.kinesis().findStream("tagged"));
  });
});
