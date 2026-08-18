import {
  CreateAccessKeyCommand,
  CreateRoleCommand,
  CreateUserCommand,
} from "@aws-sdk/client-iam";
import { AssumeRoleCommand } from "@aws-sdk/client-sts";
import {
  assertIdentical,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { assertDefined } from "../../../../util/type-guard/defined.js";

/**
 * Who simulated STS says a caller is.
 *
 * The operation needs no permission in real AWS, which is what makes it the
 * call people reach for to check that credentials are wired up correctly, so
 * what these cover is whether the answer is faithful rather than whether it is
 * allowed.
 */
describe("Simulated STS GetCallerIdentity", () => {
  it("reports an IAM User by ARN, Account and its own id", async () => {
    // Given a User that simulated IAM issued an id to
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    const created = await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Widgets" }));

    // When that User asks who it is
    const identity = await simAws.sts().getCallerIdentity(
      {},
      {
        caller: {
          kind: "arn",
          arn: `arn:aws:iam::${accountId}:user/Widgets`,
        },
      },
    );

    // Then all three members describe the User that asked
    assertIdentical(identity.Arn, `arn:aws:iam::${accountId}:user/Widgets`);
    assertIdentical(identity.Account, accountId);
    assertIdentical(identity.UserId, created.User.UserId);
  });

  it("reports the Account id as the user id for the Account root", async () => {
    // Given the Account root asking who it is
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;

    const identity = await simAws
      .sts()
      .getCallerIdentity(
        {},
        { caller: { kind: "arn", arn: `arn:aws:iam::${accountId}:root` } },
      );

    // Then the user id is the Account, which is what real STS answers
    assertIdentical(identity.UserId, accountId);
  });

  it("reports an assumed-role session by its session ARN and the Role's id", async () => {
    // Given a session assumed into a Role
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;
    const role = await simAws.iam().createRole(
      new CreateRoleCommand({
        RoleName: "Reader",
        AssumeRolePolicyDocument: JSON.stringify({
          Version: "2012-10-17",
          Statement: {
            Effect: "Allow",
            Principal: { AWS: `arn:aws:iam::${accountId}:root` },
            Action: "sts:AssumeRole",
          },
        }),
      }),
    );
    const assumed = await simAws.sts().assumeRole(
      new AssumeRoleCommand({
        RoleArn: `arn:aws:iam::${accountId}:role/Reader`,
        RoleSessionName: "nightly",
      }),
    );

    const sessionArn = assumed.AssumedRoleUser?.Arn;
    assertDefined(sessionArn, "the assumed-role session ARN");

    // When the session asks who it is
    const identity = await simAws
      .sts()
      .getCallerIdentity({}, { caller: { kind: "arn", arn: sessionArn } });

    // Then it is the session that answers, joined to the Role behind it
    assertIdentical(
      identity.Arn,
      `arn:aws:sts::${accountId}:assumed-role/Reader/nightly`,
    );
    assertIdentical(identity.UserId, `${role.Role.RoleId}:nightly`);
  });

  it("states no user id for a principal nothing created", async () => {
    // Given an ARN naming a User that was never created
    const simAws = new SimAws();
    const accountId = simAws.defaultAccountId;

    const identity = await simAws.sts().getCallerIdentity(
      {},
      {
        caller: { kind: "arn", arn: `arn:aws:iam::${accountId}:user/Ghost` },
      },
    );

    // Then the ARN is reported as asked and no id is invented for it
    assertIdentical(identity.Arn, `arn:aws:iam::${accountId}:user/Ghost`);
    assertUndefined(identity.UserId);
  });

  it("refuses a caller with no identity to report", async () => {
    // Given an anonymous caller
    const simAws = new SimAws();

    // When it asks who it is
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws
          .sts()
          .getCallerIdentity({}, { caller: { kind: "anonymous" } }),
    );

    // Then it is refused, because there is nothing to answer with
    assertStringIncludes(error.message, "sts:GetCallerIdentity");
  });

  it("answers the Account that owns the caller, not the one it was asked through", async () => {
    // Given a caller from another Account asking through this one
    const simAws = new SimAws();

    const identity = await simAws.sts().getCallerIdentity(
      {},
      {
        caller: { kind: "arn", arn: "arn:aws:iam::111111111111:user/Other" },
      },
    );

    // Then the Account is read from the caller's own ARN
    assertIdentical(identity.Account, "111111111111");
  });

  it("issues a user id shaped the way AWS shapes one", async () => {
    // Given a User simulated IAM created
    const simAws = new SimAws();
    await simAws
      .iam()
      .createUser(new CreateUserCommand({ UserName: "Shaped" }));
    await simAws
      .iam()
      .createAccessKey(new CreateAccessKeyCommand({ UserName: "Shaped" }));

    const identity = await simAws.sts().getCallerIdentity(
      {},
      {
        caller: {
          kind: "arn",
          arn: `arn:aws:iam::${simAws.defaultAccountId}:user/Shaped`,
        },
      },
    );

    // Then the id starts the way an AWS user id does
    assertStringStartsWith(identity.UserId, "AIDA");
  });
});
