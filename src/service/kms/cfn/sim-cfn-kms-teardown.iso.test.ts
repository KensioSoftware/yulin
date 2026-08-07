import {
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimKmsKey } from "../key/sim-kms-key.js";

describe("KMS CloudFormation Resource teardown", () => {
  it("schedules the key for deletion and removes its alias", async () => {
    // Given a deployed key with an alias. KMS has no DeleteKey, so the most a
    // Stack deletion can do is schedule the key's deletion.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "key-stack",
      template: {
        Resources: {
          AppKey: { Type: "AWS::KMS::Key" },
          AppKeyAlias: {
            Type: "AWS::KMS::Alias",
            Properties: {
              AliasName: "alias/app-key",
              TargetKeyId: { Ref: "AppKey" },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    const key = stack.resources.get("AppKey")?.simResource as
      | SimKmsKey
      | undefined;
    assertNonNullable(key);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the alias is gone, and the key is still there in PendingDeletion,
    // which is as far as KMS ever takes a key.
    assertUndefined(simAws.kms().findAlias("alias/app-key"));
    assertIdentical(simAws.kms().findKey(key.keyId), key);
    assertIdentical(key.keyState, "PendingDeletion");
    assertIdentical(stack.resources.get("AppKey")?.status, "DELETE_COMPLETE");
  });
});
