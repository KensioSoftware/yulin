import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimS3MountWatches } from "./sim-s3-mount-watches.js";
import { SimWatchRuntime } from "../../../watch/sim-watch-runtime.js";
import { simWatchMessages } from "../../../watch/sim-watch.config.js";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import { FakeProcess } from "../../../../test/watch/fake-process.js";

describe("mounted directories under a watch supervisor", () => {
  it("holds a directory it reloads for itself, rather than restarting", async () => {
    // Given a supervised process mounting a directory it reloads the browser
    // for
    const host = new FakeProcess();
    const directory = new TemporaryDirectory();
    await directory.resolvePath();
    const mounts = new SimS3MountWatches({
      watch: new SimWatchRuntime({ host }),
    });

    try {
      // When the directory is mounted with somewhere to reload
      mounts.register("site", directory.path(), {
        reload: { reload: (): void => undefined },
      });

      // Then the supervisor is told to leave it alone, so a rebuild reloads
      // the page instead of restarting the process and taking every simulated
      // Bucket, Table and Stack with it
      assertArrayLength(host.sent, 1);
      const [reported = {}] = host.sent;
      assertIdentical(reported["type"], simWatchMessages.heldPath);
      assertIdentical(reported["path"], directory.path());
    } finally {
      mounts.stopAll();
    }
  });

  it("names a directory nothing is reloading for as one to watch", async () => {
    // Given a supervised process mounting a directory with no browser to tell
    const host = new FakeProcess();
    const directory = new TemporaryDirectory();
    await directory.resolvePath();
    const mounts = new SimS3MountWatches({
      watch: new SimWatchRuntime({ host }),
    });

    // When the directory is mounted
    mounts.register("site", directory.path(), {});

    // Then the supervisor watches it and restarts the process for a change,
    // which is all a mount could do before it watched anything
    assertArrayLength(host.sent, 1);
    const [reported = {}] = host.sent;
    assertIdentical(reported["type"], simWatchMessages.path);
    assertArrayEquals(mounts.paths(), []);
  });

  it("watches the directory a re-mounted Bucket is serving now", async () => {
    // Given a Bucket mounted on one directory and watched
    const host = new FakeProcess();
    const first = new TemporaryDirectory();
    const second = new TemporaryDirectory();
    await first.resolvePath();
    await second.resolvePath();
    const mounts = new SimS3MountWatches({
      watch: new SimWatchRuntime({ host }),
    });
    const reload = { reload: (): void => undefined };
    mounts.register("site", first.path(), { reload });

    try {
      // When the same Bucket is mounted somewhere else
      mounts.register("site", second.path(), { reload });

      // Then the directory it is serving now is the one being watched, rather
      // than both being held open
      assertArrayEquals(mounts.paths(), [second.path()]);
    } finally {
      mounts.stopAll();
    }
  });
});
