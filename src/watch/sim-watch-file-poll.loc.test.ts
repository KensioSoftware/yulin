import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { PolledFile } from "../../test/watch/polled-file.js";

describe("SimWatchFilePoll", () => {
  it("reports a save nothing else reported", async () => {
    // Given a file being read behind a watch that has said nothing about it,
    // as a watch does when the save it should have reported went missing
    const polled = await PolledFile.of();

    try {
      // When the file is written
      await polled.write("changed");

      // Then reading it is what notices
      await polled.changes(1);
    } finally {
      polled.close();
    }
  });

  it("reports each save that follows the one before it", async () => {
    // Given a file that has already been written and reported once
    const polled = await PolledFile.of();
    await polled.write("first");
    await polled.changes(1);

    try {
      // When it is written again
      await polled.write("second");

      // Then that is a save of its own rather than the first one again
      await polled.changes(2);
    } finally {
      polled.close();
    }
  });

  it("says nothing about a file nobody has written", async () => {
    // Given a file being read that no save has touched
    const polled = await PolledFile.of();

    try {
      // When it is left alone for several turns of the read
      await polled.pause(400);

      // Then nothing is reported, because reading it is what this does and
      // changing is what it reports
      assertIdentical(polled.changeCount(), 0);
    } finally {
      polled.close();
    }
  });

  it("stops reading a file it has been closed on", async () => {
    // Given a file that is no longer being read
    const polled = await PolledFile.of();
    polled.close();

    try {
      // When it is written
      await polled.write("changed");
      await polled.pause(400);

      // Then nothing is reported, and nothing is left holding the process open
      assertIdentical(polled.changeCount(), 0);
    } finally {
      polled.close();
    }
  });
});
