import {
  DeleteSuppressedDestinationCommand,
  GetSuppressedDestinationCommand,
  ListSuppressedDestinationsCommand,
  PutSuppressedDestinationCommand,
} from "@aws-sdk/client-sesv2";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimSesBadRequestException,
  SimSesNotFoundException,
  SimSesUnsupportedOperationException,
} from "./error/sim-ses.error.js";
import type { SimSesV2 } from "./sim-ses-v2.js";

const startedAt = new Date("2026-08-16T09:00:00.000Z");
const millisecondsInADay = 24 * 60 * 60 * 1000;

describe("SimSesV2 suppression list", () => {
  it("puts an address on the list and reads it back", async () => {
    // Given a simulated SES on a fixed clock.
    const ses = new SimAws({ clock: new SimFixedClock(startedAt) }).sesV2();

    // When an address is put on the suppression list.
    await ses.putSuppressedDestination(
      new PutSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
        Reason: "BOUNCE",
      }),
    );
    const read = await ses.getSuppressedDestination(
      new GetSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
      }),
    );

    // Then the address is on the list with the reason and the time it was put
    // there.
    assertNonNullable(read.SuppressedDestination);
    assertIdentical(
      read.SuppressedDestination.EmailAddress,
      "someone@example.org",
    );
    assertIdentical(read.SuppressedDestination.Reason, "BOUNCE");
    assertIdentical(
      read.SuppressedDestination.LastUpdateTime.toISOString(),
      startedAt.toISOString(),
    );
  });

  it("replaces the reason of an address already on the list", async () => {
    // Given an address suppressed for a bounce.
    const ses = new SimAws().sesV2();

    await ses.putSuppressedDestination(
      new PutSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
        Reason: "BOUNCE",
      }),
    );

    // When the same address is put on the list for a complaint.
    await ses.putSuppressedDestination(
      new PutSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
        Reason: "COMPLAINT",
      }),
    );

    // Then it is on the list once, under the newer reason.
    const listed = ses.suppressedDestinations();

    assertArrayLength(listed, 1);
    assertNonNullable(listed[0]);
    assertIdentical(listed[0].reason, "COMPLAINT");
  });

  it("reports an address that is not on the list as not found", async () => {
    // Given a simulated SES with an empty suppression list.
    const ses = new SimAws().sesV2();

    // When an address nobody suppressed is read.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.getSuppressedDestination(
        new GetSuppressedDestinationCommand({
          EmailAddress: "someone@example.org",
        }),
      );
    });

    assertInstanceOf(error, SimSesNotFoundException);
  });

  it("takes an address off the list, and removing an unlisted one succeeds", async () => {
    // Given a suppressed address.
    const ses = new SimAws().sesV2();

    await ses.putSuppressedDestination(
      new PutSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
        Reason: "BOUNCE",
      }),
    );

    // When it is removed twice.
    await ses.deleteSuppressedDestination(
      new DeleteSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
      }),
    );
    await ses.deleteSuppressedDestination(
      new DeleteSuppressedDestinationCommand({
        EmailAddress: "someone@example.org",
      }),
    );

    // Then the list is empty and the second removal was no failure.
    assertArrayLength(ses.suppressedDestinations(), 0);
  });

  it("lists the addresses on the list, filtered by reason", async () => {
    // Given two bounced addresses and one complaint.
    const ses = new SimAws().sesV2();

    await suppress(ses, "bounced@example.org", "BOUNCE");
    await suppress(ses, "complained@example.org", "COMPLAINT");
    await suppress(ses, "bounced-too@example.org", "BOUNCE");

    // When the list is read for bounces only.
    const listed = await ses.listSuppressedDestinations(
      new ListSuppressedDestinationsCommand({ Reasons: ["BOUNCE"] }),
    );

    // Then the complaint is left out and the rest come back in the order they
    // were put on the list.
    assertArrayEquals(
      listed.SuppressedDestinationSummaries?.map(
        (summary) => summary.EmailAddress,
      ),
      ["bounced@example.org", "bounced-too@example.org"],
    );
  });

  it("lists the addresses added within a window", async () => {
    // Given addresses suppressed a day apart.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const ses = simAws.sesV2();

    await suppress(ses, "first@example.org", "BOUNCE");
    await simAws.clock().advanceBy({ days: 1 });
    await suppress(ses, "second@example.org", "BOUNCE");

    // When the list is read from the day after the first.
    const justAfterTheFirst = new Date(startedAt.getTime() + 1);
    const twoDaysOn = new Date(startedAt.getTime() + 2 * millisecondsInADay);
    const listed = await ses.listSuppressedDestinations(
      new ListSuppressedDestinationsCommand({
        StartDate: justAfterTheFirst,
        EndDate: twoDaysOn,
      }),
    );

    assertArrayEquals(
      listed.SuppressedDestinationSummaries?.map(
        (summary) => summary.EmailAddress,
      ),
      ["second@example.org"],
    );
  });

  it("pages a long suppression list", async () => {
    // Given three suppressed addresses.
    const ses = new SimAws().sesV2();

    await suppress(ses, "one@example.org", "BOUNCE");
    await suppress(ses, "two@example.org", "BOUNCE");
    await suppress(ses, "three@example.org", "BOUNCE");

    // When they are read two at a time.
    const first = await ses.listSuppressedDestinations(
      new ListSuppressedDestinationsCommand({ PageSize: 2 }),
    );
    const second = await ses.listSuppressedDestinations(
      new ListSuppressedDestinationsCommand({
        PageSize: 2,
        NextToken: first.NextToken,
      }),
    );

    // Then the first page carries a token to the second, and the second
    // carries none.
    assertArrayLength(first.SuppressedDestinationSummaries, 2);
    assertNonNullable(first.NextToken);
    assertArrayLength(second.SuppressedDestinationSummaries, 1);
    assertUndefined(second.NextToken);
  });

  it("lists an empty suppression list without a request", async () => {
    // Given a simulated SES nobody has suppressed anything on.
    const ses = new SimAws().sesV2();

    // When the list is read with no request at all.
    const listed = await ses.listSuppressedDestinations();

    assertArrayLength(listed.SuppressedDestinationSummaries, 0);
  });
});

describe("SimSesV2 suppression refusals", () => {
  it("refuses a suppression reason SES does not have", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.putSuppressedDestination(
        new PutSuppressedDestinationCommand({
          EmailAddress: "someone@example.org",
          Reason: "SPAM" as "BOUNCE",
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a suppression list entry that is not an address", async () => {
    const ses = new SimAws().sesV2();

    // A domain is a valid identity and not a valid suppression list entry.
    const error = await assertThrowsErrorAsync(async () => {
      await ses.putSuppressedDestination(
        new PutSuppressedDestinationCommand({
          EmailAddress: "example.org",
          Reason: "BOUNCE",
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a request with no address at all", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.deleteSuppressedDestination(
        new DeleteSuppressedDestinationCommand(
          {} as unknown as { EmailAddress: string },
        ),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });

  it("refuses a request aimed at a tenant's list", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.listSuppressedDestinations(
        new ListSuppressedDestinationsCommand({ TenantName: "customer-one" }),
      );
    });

    assertInstanceOf(error, SimSesUnsupportedOperationException);
  });

  it("refuses a filter naming a reason SES does not have", async () => {
    const ses = new SimAws().sesV2();

    const error = await assertThrowsErrorAsync(async () => {
      await ses.listSuppressedDestinations(
        new ListSuppressedDestinationsCommand({
          Reasons: ["SPAM" as "BOUNCE"],
        }),
      );
    });

    assertInstanceOf(error, SimSesBadRequestException);
  });
});

/**
 * Put an address on the list through the command, since that is the path an
 * application takes.
 */
async function suppress(
  ses: SimSesV2,
  emailAddress: string,
  reason: "BOUNCE" | "COMPLAINT",
): Promise<void> {
  await ses.putSuppressedDestination(
    new PutSuppressedDestinationCommand({
      EmailAddress: emailAddress,
      Reason: reason,
    }),
  );
}
