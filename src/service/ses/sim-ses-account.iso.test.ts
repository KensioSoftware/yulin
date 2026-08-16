import {
  GetAccountCommand,
  PutAccountDetailsCommand,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import {
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
import { SimAws } from "../aws/sim-aws.js";
import { SimSesBadRequestException } from "./error/sim-ses.error.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");

const welcome = {
  FromEmailAddress: "hello@example.com",
  Destination: { ToAddresses: ["someone@example.org"] },
  Content: {
    Simple: {
      Subject: { Data: "Welcome" },
      Body: { Text: { Data: "Hi there" } },
    },
  },
} satisfies SendEmailCommandInput;

describe("SimSesV2 account", () => {
  it("reports a sandbox account and its sending limits", async () => {
    // Given a simulated SES nobody has configured.
    const ses = new SimAws().sesV2();

    // When the account is read.
    const account = await ses.getAccount(new GetAccountCommand({}));

    // Then it is in the sandbox on the real sandbox limits, and has no
    // details to report until something puts them.
    assertFalse(account.ProductionAccessEnabled);
    assertNonNullable(account.SendQuota);
    assertIdentical(account.SendQuota.Max24HourSend, 200);
    assertIdentical(account.SendQuota.MaxSendRate, 1);
    assertTrue(account.SendingEnabled);
    assertIdentical(account.EnforcementStatus, "HEALTHY");
    assertUndefined(account.Details);
  });

  it("leaves the sandbox and reports the production limits", async () => {
    // Given a simulated SES in the sandbox.
    const ses = new SimAws().sesV2();

    // When account details asking for production access are put.
    await ses.putAccountDetails(
      new PutAccountDetailsCommand({
        MailType: "TRANSACTIONAL",
        WebsiteURL: "https://example.com",
        ProductionAccessEnabled: true,
      }),
    );
    const account = await ses.getAccount(new GetAccountCommand({}));

    // Then the account has production access on the higher limits. Real SES
    // has a human review this first, which is not something a test can wait
    // for, so the request is granted here.
    assertTrue(account.ProductionAccessEnabled);
    assertNonNullable(account.SendQuota);
    assertIdentical(account.SendQuota.Max24HourSend, 50_000);
    assertIdentical(account.SendQuota.MaxSendRate, 14);
    assertNonNullable(account.Details);
    assertIdentical(account.Details.MailType, "TRANSACTIONAL");
    assertIdentical(account.Details.WebsiteURL, "https://example.com");
    assertIdentical(account.Details.ReviewDetails?.Status, "GRANTED");
  });

  it("records details without granting production access", async () => {
    // Given a simulated SES in the sandbox.
    const ses = new SimAws().sesV2();

    // When details are put without asking to leave the sandbox.
    await ses.putAccountDetails(
      new PutAccountDetailsCommand({
        MailType: "MARKETING",
        WebsiteURL: "https://example.com",
      }),
    );
    const account = await ses.getAccount(new GetAccountCommand({}));

    // Then the details are kept and the account is still in the sandbox.
    assertNonNullable(account.Details);
    assertIdentical(account.Details.MailType, "MARKETING");
    assertFalse(account.ProductionAccessEnabled);
    assertIdentical(account.Details.ReviewDetails?.Status, "PENDING");
  });

  it("counts what was sent in the last 24 hours", async () => {
    // Given an account out of the sandbox that has sent a message.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const ses = simAws.sesV2();

    ses.verifyIdentity("hello@example.com");
    await ses.putAccountDetails(
      new PutAccountDetailsCommand({
        MailType: "TRANSACTIONAL",
        WebsiteURL: "https://example.com",
        ProductionAccessEnabled: true,
      }),
    );
    await ses.sendEmail(new SendEmailCommand(welcome));

    const justSent = await ses.getAccount(new GetAccountCommand({}));

    // When the clock moves past the 24 hour window.
    await simAws.clock().advanceBy({ hours: 25 });

    const later = await ses.getAccount(new GetAccountCommand({}));

    // Then the count falls out of the window on simulated time, the way an
    // account's would.
    assertIdentical(justSent.SendQuota?.SentLast24Hours, 1);
    assertIdentical(later.SendQuota?.SentLast24Hours, 0);
  });

  it("refuses account details with no mail type", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When details are put without the mail type real SES requires.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.putAccountDetails(
        new PutAccountDetailsCommand({
          WebsiteURL: "https://example.com",
        } as unknown as { MailType: "TRANSACTIONAL"; WebsiteURL: string }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses account details with no website", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When details are put without the website real SES requires.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.putAccountDetails(
        new PutAccountDetailsCommand({
          MailType: "TRANSACTIONAL",
        } as unknown as { MailType: "TRANSACTIONAL"; WebsiteURL: string }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a mail type SES does not have", async () => {
    // Given a simulated SES.
    const ses = new SimAws().sesV2();

    // When details name a mail type that is neither of the two SES accepts.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.putAccountDetails(
        new PutAccountDetailsCommand({
          MailType: "NEWSLETTER" as "MARKETING",
          WebsiteURL: "https://example.com",
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });
});
