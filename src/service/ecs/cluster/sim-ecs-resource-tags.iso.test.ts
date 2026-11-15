import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimEcsAccessDeniedException } from "../error/sim-ecs.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("a sim ECS cluster's tags in IAM", () => {
  it("lets a policy decide a request on the cluster's tags", async () => {
    // Given two clusters tagged for different teams, and a caller allowed to
    // delete those tagged for its own under the ECS prefix
    const simAws = new SimAws();
    for (const team of ["orders", "billing"]) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await simAws.ecs().createCluster({
        input: { clusterName: team, tags: [{ key: "team", value: team }] },
      });
    }
    const role = await simIamRoleWithPolicyFactory.make(
      {
        actions: ["ecs:DeleteCluster"],
        condition: { StringEquals: { "ecs:ResourceTag/team": "orders" } },
      },
      simAws,
    );
    const caller = { kind: "arn", arn: role.Arn } as const;

    // When it deletes each
    const deleted = await simAws
      .ecs()
      .deleteCluster({ input: { cluster: "orders" } }, { caller });
    const error = await assertThrowsErrorAsync(async () =>
      simAws.ecs().deleteCluster({ input: { cluster: "billing" } }, { caller }),
    );

    // Then only its own team's cluster goes
    assertIdentical(deleted.cluster?.clusterName, "orders");
    assertInstanceOf(error, SimEcsAccessDeniedException);
  });
});
