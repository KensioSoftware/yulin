import {
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimIamUser } from "../../user/sim-iam-user.js";

async function deployUser(
  properties: SimCfnTemplateValueRecord,
): Promise<SimIamUser | undefined> {
  const simAws = new SimAws();

  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "iam-user-validation-stack",
    template: {
      Resources: {
        ValidatedUser: {
          Type: "AWS::IAM::User",
          Properties: properties,
        },
      },
    },
  });

  return stack.getResource("ValidatedUser")?.simResource as
    | SimIamUser
    | undefined;
}

describe("IAM CloudFormation User validation", () => {
  it("fails the Resource for a Group membership", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({ UserName: "GroupedUser", Groups: ["Administrators"] }),
    );

    assertInstanceOf(error, TypeError);
    assertStringIncludes(error.message, "Groups are not simulated");
  });

  it("creates a User declaring no Group membership", async () => {
    // CDK leaves Groups out of the template for a User in no group, but an
    // empty list gives up nothing, so it still deploys.
    const user = await deployUser({ UserName: "UngroupedUser", Groups: [] });

    assertNonNullable(user);
  });

  it("rejects a non-array Groups", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({ UserName: "GroupedUser", Groups: "Administrators" }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string UserName", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({ UserName: 42 }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-string Path", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({ UserName: "InvalidUser", Path: 42 }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-object LoginProfile", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({ UserName: "InvalidUser", LoginProfile: "password" }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a LoginProfile without a string Password", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({
        UserName: "InvalidUser",
        LoginProfile: { PasswordResetRequired: true },
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-boolean PasswordResetRequired", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({
        UserName: "InvalidUser",
        LoginProfile: {
          Password: "initial-console-password",
          PasswordResetRequired: "yes",
        },
      }),
    );

    assertInstanceOf(error, TypeError);
  });

  it("rejects a non-array Policies", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({ UserName: "InvalidUser", Policies: "ReadReports" }),
    );

    assertInstanceOf(error, TypeError);
    assertStringIncludes(error.message, "AWS::IAM::User");
  });

  it("rejects a non-array ManagedPolicyArns", async () => {
    const error = await assertThrowsErrorAsync(async () =>
      deployUser({
        UserName: "InvalidUser",
        ManagedPolicyArns: "arn:aws:iam::aws:policy/ReadOnlyAccess",
      }),
    );

    assertInstanceOf(error, TypeError);
    assertStringIncludes(error.message, "AWS::IAM::User");
  });
});
