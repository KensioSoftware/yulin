import { assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { PolledFile } from "../../test/watch/polled-file.js";

describe("SimWatchFilePoll", () => {
  it("reports a save nothing else reported", async () => {
    // Given a file being read behind a watch that has said nothing about it,
    // as a watch does when the save it should have reported went missing
    const polled = await PolledFile.of();

    try {
      // When the file is saved
      await polled.write();

      // Then reading it is what notices
      await polled.changes(1);
    } finally {
      polled.close();
    }
  });

  it("stays quiet about a save the watch got to first", async () => {
    const polled = await PolledFile.of();

    try {
      // Given a watch that reported a save as it happened
      polled.poll.reported();

      // When the read comes round to that same save
      await polled.write();
      await polled.pause(400);

      // Then it is left as the one change the watch already made of it, rather
      // than becoming a second one a moment later
      assertIdentical(polled.changeCount(), 0);
    } finally {
      polled.close();
    }
  });

  it("reports the next save after one the watch reported", async () => {
    const polled = await PolledFile.of();

    try {
      // Given a save the watch reported and the read stayed quiet about
      polled.poll.reported();
      await polled.write();
      await polled.pause(400);

      // When the watch loses the save after it
      await polled.write();

      // Then that one is reported, because staying quiet covers the save the
      // watch reported rather than every save after it
      await polled.changes(1);
    } finally {
      polled.close();
    }
  });

  it("stops reading a file it has been closed on", async () => {
    const polled = await PolledFile.of();

    try {
      // Given a file that is no longer being read
      polled.close();

      // When it is saved
      await polled.write();
      await polled.pause(400);

      // Then nothing is reported, and nothing is left holding the process open
      assertIdentical(polled.changeCount(), 0);
    } finally {
      polled.close();
    }
  });
});
