import {
  CreateEmailIdentityCommand,
  DeleteEmailIdentityCommand,
  GetEmailIdentityCommand,
  ListEmailIdentitiesCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEquals,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import type { SimAwsAccountId } from "../aws/sim-aws-account.js";
import { SimAws } from "../aws/sim-aws.js";
import { SimSesBadRequestException } from "./error/sim-ses.error.js";

const accountIdTwoTwos = "222222222222" as SimAwsAccountId;
const createdAt = new Date("2026-08-16T09:00:00.000Z");

describe("SimSesV2 email identities", () => {
  it("creates an address identity that is not yet verified", async () => {
    // Given a simulated SES with a fixed clock.
    const ses = new SimAws({ clock: new SimFixedClock(createdAt) }).sesV2();

    // When an email address identity is created and read back.
    const created = await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
    );
    const read = await ses.getEmailIdentity(
      new GetEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
    );

    // Then it is an address identity still waiting on its verification, the
    // way a real one waits on the link SES emails.
    assertIdentical(created.IdentityType, "EMAIL_ADDRESS");
    assertFalse(created.VerifiedForSendingStatus);
    assertIdentical(read.VerificationStatus, "PENDING");
    assertFalse(read.VerifiedForSendingStatus);
  });

  it("creates a domain identity from a name with no address in it", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When a domain is created as an identity.
    const created = await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );

    // Then SES took it as a domain, which it decides from the missing `@`
    // rather than from a parameter saying so.
    assertIdentical(created.IdentityType, "DOMAIN");
  });

  it("reports an identity as verified once the simulator verifies it", async () => {
    // Given an identity waiting on its verification.
    const ses = new SimAws().sesV2();

    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
    );

    // When the simulator stands in for the emailed link being clicked.
    ses.verifyIdentity("hello@example.com");

    const read = await ses.getEmailIdentity(
      new GetEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
    );

    // Then SES reports it as verified and able to send.
    assertIdentical(read.VerificationStatus, "SUCCESS");
    assertTrue(read.VerifiedForSendingStatus);
  });

  it("verifies an identity that was never created", async () => {
    // Given a simulated SES with nothing in it.
    const ses = new SimAws().sesV2();

    // When an identity is verified without being created first.
    ses.verifyIdentity("hello@example.com");

    // Then it is there and verified: setting up a mailbox in a test means
    // both, and saying so twice buys nothing.
    const read = await ses.getEmailIdentity(
      new GetEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
    );

    assertTrue(read.VerifiedForSendingStatus);
  });

  it("puts a verified identity back to pending", () => {
    // Given a verified identity.
    const ses = new SimAws().sesV2();
    const identity = ses.verifyIdentity("example.com");

    // When whatever proved it stops holding.
    identity.unverify();

    // Then it is pending again, as a real one is when its records stop
    // resolving.
    assertIdentical(identity.verificationStatus, "PENDING");
    assertFalse(identity.isVerified);
  });

  it("matches a domain identity without regard to case", async () => {
    // Given a domain identity created in mixed case.
    const ses = new SimAws().sesV2();

    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "Example.COM" }),
    );

    // When it is read back in another case.
    const read = await ses.getEmailIdentity(
      new GetEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );

    // Then it is the same identity: domains are case insensitive.
    assertIdentical(read.IdentityType, "DOMAIN");
  });

  it("keeps two addresses whose local parts differ only in case apart", async () => {
    // Given an address identity.
    const ses = new SimAws().sesV2();

    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "Sales@example.com" }),
    );

    // When one differing only in the case of its local part is created.
    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "sales@example.com" }),
    );

    // Then both are there. The local part of an address is case sensitive per
    // RFC 5321, so these are two mailboxes in principle.
    assertArrayLength(ses.allIdentities(), 2);
  });

  it("names an identity by the account and region it is in", async () => {
    // Given an identity in one account and region.
    const ses = new SimAws()
      .accountRegionScope(accountIdTwoTwos, "us-east-1")
      .sesV2();

    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "example.com" }),
    );

    // When its ARN is read.
    const identity = ses.findIdentity("example.com");

    // Then the ARN names that account and region.
    assertNonNullable(identity);
    assertIdentical(
      identity.arn,
      "arn:aws:ses:us-east-1:222222222222:identity/example.com",
    );
  });

  it("verifies an identity in one region and not in another", () => {
    // Given an identity verified in one region.
    const simAws = new SimAws();

    simAws
      .accountRegionScope(simAws.defaultAccountId, "us-east-1")
      .sesV2()
      .verifyIdentity("example.com");

    // When another region is asked for it.
    const elsewhere = simAws
      .accountRegionScope(simAws.defaultAccountId, "eu-west-2")
      .sesV2()
      .findIdentity("example.com");

    // Then it is not there. Verifying in one region verifies nothing in
    // another, on real SES as here.
    assertUndefined(elsewhere);
  });

  it("lists identities in the order they were created", async () => {
    // Given three identities.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("example.com");
    ses.verifyIdentity("hello@example.com");
    await ses.createEmailIdentity(
      new CreateEmailIdentityCommand({ EmailIdentity: "example.org" }),
    );

    // When they are listed.
    const listed = await ses.listEmailIdentities(
      new ListEmailIdentitiesCommand({}),
    );

    // Then each is reported with whether it may send, in creation order.
    assertNonNullable(listed.EmailIdentities);
    assertArrayEquals(
      listed.EmailIdentities.map((identity) => identity.IdentityName),
      ["example.com", "hello@example.com", "example.org"],
    );
    assertArrayEquals(
      listed.EmailIdentities.map((identity) => identity.SendingEnabled),
      [true, true, false],
    );
  });

  it("pages a listing of identities", async () => {
    // Given more identities than one page holds.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("one.example.com");
    ses.verifyIdentity("two.example.com");
    ses.verifyIdentity("three.example.com");

    // When they are read a page at a time.
    const first = await ses.listEmailIdentities(
      new ListEmailIdentitiesCommand({ PageSize: 2 }),
    );
    const second = await ses.listEmailIdentities(
      new ListEmailIdentitiesCommand({
        PageSize: 2,
        NextToken: first.NextToken,
      }),
    );

    // Then the token from the first page reaches the rest, and the last page
    // offers none.
    assertArrayLength(first.EmailIdentities ?? [], 2);
    assertArrayEquals(
      second.EmailIdentities?.map((identity) => identity.IdentityName),
      ["three.example.com"],
    );
    assertUndefined(second.NextToken);
  });

  it("refuses a listing token this simulation did not issue", async () => {
    // Given a simulated SES with one identity.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("example.com");

    // When a listing is asked for with a token from somewhere else.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.listEmailIdentities(
        new ListEmailIdentitiesCommand({ NextToken: "not-a-token" }),
      );
    });

    // Then it is refused rather than quietly starting again at the beginning.
    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("deletes an identity", async () => {
    // Given an identity.
    const ses = new SimAws().sesV2();

    ses.verifyIdentity("hello@example.com");

    // When it is deleted.
    await ses.deleteEmailIdentity(
      new DeleteEmailIdentityCommand({ EmailIdentity: "hello@example.com" }),
    );

    // Then it is gone.
    assertArrayLength(ses.allIdentities(), 0);
  });
});
