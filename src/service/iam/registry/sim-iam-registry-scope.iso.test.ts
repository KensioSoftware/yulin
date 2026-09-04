import {
  assertIdentical,
  assertNotEqual,
  assertThrowsError,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { AwsRegion } from "../../aws/sim-aws-region.js";
import { SimAws } from "../../aws/sim-aws.js";

describe("Sim IAM registry scoping", () => {
  it("reuses and registers the same IAM facade across regions in one Account", () => {
    // Given a top-level simulated AWS instance with one Account.
    const simAws = new SimAws();
    const account = simAws.account("111111111111");

    // When IAM is requested from two different Regions in that Account.
    const euWestIam = account.region(AwsRegion.EuWest1).iam();
    const usEastIam = account.region(AwsRegion.UsEast1).iam();

    // Then IAM is account-scoped and registered under that Account.
    assertIdentical(euWestIam, usEastIam);
    assertIdentical(
      simAws.iamRegistry.iamForAccount(account.accountId),
      euWestIam,
    );
  });

  it("registers separate IAM facades for separate Accounts", () => {
    // Given a top-level simulated AWS instance with two Accounts.
    const simAws = new SimAws();
    const firstAccount = simAws.account("111111111111");
    const secondAccount = simAws.account("222222222222");

    // When IAM is requested from each Account.
    const firstAccountIam = firstAccount.iam();
    const secondAccountIam = secondAccount.iam();

    // Then each Account gets and resolves its own IAM facade.
    assertNotEqual(firstAccountIam, secondAccountIam);
    assertIdentical(
      simAws.iamRegistry.iamForAccount(firstAccount.accountId),
      firstAccountIam,
    );
    assertIdentical(
      simAws.iamRegistry.iamForAccount(secondAccount.accountId),
      secondAccountIam,
    );
  });

  it("reports when IAM has not yet been instantiated", () => {
    // Given a simulated AWS Account whose IAM facade has not been requested.
    const simAws = new SimAws();
    const account = simAws.account("111111111111");

    // When its IAM registration is resolved.
    const error = assertThrowsError(() => {
      simAws.iamRegistry.iamForAccount(account.accountId);
    });

    // Then the missing registration is reported diagnostically.
    assertIdentical(
      error.message,
      `Sim IAM is not registered for Account ${account.accountId}`,
    );
  });

  it("keeps IAM registrations isolated between SimAws instances", () => {
    // Given two independent simulated AWS environments.
    const firstSimAws = new SimAws();
    const secondSimAws = new SimAws();
    const accountId = firstSimAws.account("111111111111").accountId;

    // When IAM is created in only the first environment.
    const firstIam = firstSimAws.account(accountId).iam();

    // Then only the first environment can resolve it.
    assertIdentical(firstSimAws.iamRegistry.iamForAccount(accountId), firstIam);
    const error = assertThrowsError(() => {
      secondSimAws.iamRegistry.iamForAccount(accountId);
    });
    assertIdentical(
      error.message,
      `Sim IAM is not registered for Account ${accountId}`,
    );
  });
});
