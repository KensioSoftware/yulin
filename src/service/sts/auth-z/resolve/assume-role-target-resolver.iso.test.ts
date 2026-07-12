import {
  assertIdentical,
  assertObjectMatches,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { AssumeRoleTargetResolver } from "./assume-role-target-resolver.js";
import { makeSimAwsAccountId } from "../../../aws/sim-aws-account.js";

describe("AssumeRole target resolution", () => {
  it("resolves the Role name when the target is supplied as an Account ID", () => {
    // Given a Role ARN and a target Account ID matching the ARN.
    const accountId = makeSimAwsAccountId();
    const roleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const resolver = new AssumeRoleTargetResolver();

    // When the target is resolved from its Account ID.
    const target = resolver.resolve(roleArn, accountId);

    // Then the resolver returns the Account and Role encoded in the ARN.
    assertObjectMatches(target, {
      accountId,
      roleName: "TargetRole",
    });
  });

  it("rejects an Account ID that differs from the Role ARN", () => {
    // Given a Role ARN and a different target Account ID.
    const roleAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
    const roleArn = `arn:aws:iam::${roleAccountId}:role/TargetRole`;
    const resolver = new AssumeRoleTargetResolver();

    // When the Role is resolved using the different Account ID.
    const error = assertThrowsError(() =>
      resolver.resolve(roleArn, targetAccountId),
    );

    // Then the resolver reports that the target Account does not match the ARN.
    assertIdentical(
      error.message,
      `Target Account ${targetAccountId} does not match Role ARN ${roleArn}`,
    );
  });

  it("rejects parsed target parts with a different Account ID", () => {
    // Given a Role ARN and parsed target parts for a different Account.
    const roleAccountId = makeSimAwsAccountId();
    const targetAccountId = makeSimAwsAccountId();
    const roleArn = `arn:aws:iam::${roleAccountId}:role/TargetRole`;
    const resolver = new AssumeRoleTargetResolver();

    // When the Role is resolved using the mismatched parsed target.
    const error = assertThrowsError(() =>
      resolver.resolve(roleArn, {
        accountId: targetAccountId,
        roleName: "TargetRole",
      }),
    );

    // Then the resolver rejects target parts that do not represent the ARN.
    assertIdentical(
      error.message,
      `Target Role ARN parts do not match Role ARN ${roleArn}`,
    );
  });

  it("rejects parsed target parts with a different Role name", () => {
    // Given a Role ARN and parsed target parts with another Role name.
    const accountId = makeSimAwsAccountId();
    const roleArn = `arn:aws:iam::${accountId}:role/TargetRole`;
    const resolver = new AssumeRoleTargetResolver();

    // When the Role is resolved using the mismatched parsed target.
    const error = assertThrowsError(() =>
      resolver.resolve(roleArn, {
        accountId,
        roleName: "DifferentRole",
      }),
    );

    // Then the resolver rejects target parts that do not represent the ARN.
    assertIdentical(
      error.message,
      `Target Role ARN parts do not match Role ARN ${roleArn}`,
    );
  });
});
