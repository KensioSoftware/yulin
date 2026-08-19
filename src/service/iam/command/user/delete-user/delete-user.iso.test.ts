import {
  AttachUserPolicyCommand,
  CreatePolicyCommand,
  CreateUserCommand,
  DeleteUserCommand,
  PutUserPolicyCommand,
} from "@aws-sdk/client-iam";
import {
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimIam } from "../../../sim-iam.js";
import {
  SimIamDeleteConflict,
  SimIamNoSuchEntity,
} from "../../../error/sim-iam.error.js";
import type { SimIamUsername } from "../../../user/sim-iam-user.js";

const readObjectsDocument = JSON.stringify({
  Version: "2012-10-17",
  Statement: {
    Effect: "Allow",
    Action: "s3:GetObject",
    Resource: "*",
  },
});

describe("IAM DeleteUserCommand", () => {
  it("deletes a User that has no policies on it", async () => {
    // Given a User with nothing attached to it.
    const simIam = new SimIam();
    await simIam.createUser(new CreateUserCommand({ UserName: "BareUser" }));

    // When the User is deleted.
    await simIam.deleteUser(new DeleteUserCommand({ UserName: "BareUser" }));

    // Then IAM no longer has it.
    assertUndefined(simIam.users.get("BareUser" as SimIamUsername));
  });

  it("refuses a User that still has an inline policy", async () => {
    // Given a User carrying an inline policy.
    const simIam = new SimIam();
    await simIam.createUser(
      new CreateUserCommand({ UserName: "InlinePolicyUser" }),
    );
    await simIam.putUserPolicy(
      new PutUserPolicyCommand({
        UserName: "InlinePolicyUser",
        PolicyName: "ReadObjects",
        PolicyDocument: readObjectsDocument,
      }),
    );

    // When the User is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteUser(
        new DeleteUserCommand({ UserName: "InlinePolicyUser" }),
      ),
    );

    // Then IAM refuses, as it does until the policies are removed.
    assertInstanceOf(error, SimIamDeleteConflict);
    assertIdentical(error.$metadata.httpStatusCode, 409);
    assertStringIncludes(error.message, "must detach all policies first");
  });

  it("refuses a User that still has a managed policy attached", async () => {
    // Given a User with a managed policy attached to it.
    const simIam = new SimIam();
    await simIam.createUser(
      new CreateUserCommand({ UserName: "AttachedPolicyUser" }),
    );
    const policy = await simIam.createPolicy(
      new CreatePolicyCommand({
        PolicyName: "ReadObjects",
        PolicyDocument: readObjectsDocument,
      }),
    );
    await simIam.attachUserPolicy(
      new AttachUserPolicyCommand({
        UserName: "AttachedPolicyUser",
        PolicyArn: policy.Policy.Arn,
      }),
    );

    // When the User is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteUser(
        new DeleteUserCommand({ UserName: "AttachedPolicyUser" }),
      ),
    );

    // Then IAM refuses.
    assertInstanceOf(error, SimIamDeleteConflict);
  });

  it("frees the name for another User of the same name", async () => {
    // Given a User whose name a later CreateUser would otherwise collide with.
    const simIam = new SimIam();
    await simIam.createUser(new CreateUserCommand({ UserName: "Reporting" }));
    await simIam.deleteUser(new DeleteUserCommand({ UserName: "Reporting" }));

    // When a User of the same name is created again.
    const recreated = await simIam.createUser(
      new CreateUserCommand({ UserName: "Reporting" }),
    );

    // Then IAM takes it, with a User ID of its own.
    assertIdentical(recreated.User.UserName, "Reporting");
  });

  it("rejects a User that does not exist", async () => {
    // Given an IAM Account without the requested User.
    const simIam = new SimIam();

    // When the missing User is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteUser(new DeleteUserCommand({ UserName: "Absent" })),
    );

    // Then IAM answers with its missing-entity error.
    assertInstanceOf(error, SimIamNoSuchEntity);
  });

  it("rejects a missing required UserName input", async () => {
    // Given an IAM Account.
    const simIam = new SimIam();

    // When DeleteUser is called without its required UserName.
    const error = await assertThrowsErrorAsync(async () =>
      simIam.deleteUser(
        // @ts-expect-error -- testing invalid input
        new DeleteUserCommand({}),
      ),
    );

    // Then request validation identifies the missing input.
    assertStringIncludes(error.message, "UserName is required");
  });
});
