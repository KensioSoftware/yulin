import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("a sim Kinesis stream's tags in IAM", () => {
  it("lets a policy decide a request on the stream's tags", async () => {
    // Given two streams tagged for different teams, and a caller allowed to
    // describe those tagged for its own
    const simAws = new SimAws();
    for (const team of ["orders", "billing"]) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await simAws.kinesis().createStream({
        input: { StreamName: team, ShardCount: 1, Tags: { team } },
      });
    }
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["kinesis:DescribeStreamSummary"],
        condition: { StringEquals: { "aws:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it describes each
    const described = await simAws
      .kinesis()
      .describeStreamSummary({ input: { StreamName: "orders" } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .kinesis()
        .describeStreamSummary(
          { input: { StreamName: "billing" } },
          { caller },
        ),
    );

    // Then only its own team's stream is described
    assertIdentical(described.StreamDescriptionSummary.StreamName, "orders");
    assertInstanceOf(error, SimIamAccessDenied);
  });
});
