import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../iam/error/sim-iam.error.js";
import { simIamRoleWithPolicyFactory } from "../../iam/role/sim-iam-role-with-policy.factory.js";

describe("a sim secret's tags in IAM", () => {
  it("lets a policy decide a read on the secret's tags, under either prefix", async () => {
    // Given two secrets tagged for different teams
    const simAws = new SimAws();
    for (const [name, team] of [
      ["orders/api-key", "orders"],
      ["billing/api-key", "billing"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- created in order
      await simAws.secretsManager().createSecret({
        input: {
          Name: name,
          SecretString: "value",
          Tags: [{ Key: "team", Value: team }],
        },
      });
    }

    for (const key of [
      "aws:ResourceTag/team",
      "secretsmanager:ResourceTag/team",
    ]) {
      // And a caller allowed to read those tagged for its own team
      // oxlint-disable-next-line no-await-in-loop -- one Role per key
      const role = await simIamRoleWithPolicyFactory.make(
        {
          roleName: key.split(":", 1)[0] ?? "Reader",
          actions: ["secretsmanager:GetSecretValue"],
          condition: { StringEquals: { [key]: "orders" } },
        },
        simAws,
      );
      const caller = { kind: "arn", arn: role.Arn } as const;

      // When it reads each
      // oxlint-disable-next-line no-await-in-loop -- one Role per key
      const read = await simAws
        .secretsManager()
        .getSecretValue({ input: { SecretId: "orders/api-key" } }, { caller });
      // oxlint-disable-next-line no-await-in-loop -- one Role per key
      const error = await assertThrowsErrorAsync(async () =>
        simAws
          .secretsManager()
          .getSecretValue(
            { input: { SecretId: "billing/api-key" } },
            { caller },
          ),
      );

      // Then only its own team's secret is read
      assertIdentical(read.SecretString, "value");
      assertInstanceOf(error, SimIamAccessDenied);
    }
  });
});
