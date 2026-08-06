import { assertArrayEquals, assertIdentical } from "@kensio/smartass";
import { describe, it } from "vitest";
import { MountedSite, mountPause } from "../../../../test/s3/mounted-site.js";

describe("a directory mounted into a Bucket that changes", () => {
  it("reloads the connected browsers once the writes stop", async () => {
    // Given a mounted directory the browser is reloaded for
    const site = await MountedSite.of();

    try {
      // When a build writes a page into it
      await site.write("index.html", "<h1>Rebuilt</h1>");
      await site.reloaded();
      await mountPause(200);

      // Then the browser is told once, rather than being told again for
      // whatever the write did to the directory around it
      assertIdentical(site.reloadCount(), 1);
      assertArrayEquals(site.simAws.s3().watchedMountedDirectories(), [
        site.path(),
      ]);
    } finally {
      site.stop();
    }
  });

  it("makes one reload out of a build writing a whole tree", async () => {
    // Given a mounted directory the browser is reloaded for
    const site = await MountedSite.of();

    try {
      // When a build writes the pages it generated, in nested directories as
      // a site generator lays them out
      await site.write("index.html", "<h1>Rebuilt</h1>");
      await site.write("about/index.html", "<h1>About</h1>");
      await site.write("posts/first/index.html", "<h1>First</h1>");
      await site.write("assets/site.css", "h1 { color: red }");

      await site.reloaded();
      await mountPause(300);

      // Then the whole build is one reload, not one per file
      assertIdentical(site.reloadCount(), 1);
    } finally {
      site.stop();
    }
  });

  it("watches nothing when the mount was not given somewhere to reload", async () => {
    // Given a directory mounted the way a test mounts one, with no browser to
    // tell about it
    const site = await MountedSite.of({ reload: false });

    try {
      // When a build writes a page into it
      await site.write("index.html", "<h1>Rebuilt</h1>");
      await mountPause(500);

      // Then nothing was watching it, so nothing is holding the process open
      assertArrayEquals(site.simAws.s3().watchedMountedDirectories(), []);
      assertIdentical(site.reloadCount(), 0);
    } finally {
      site.stop();
    }
  });

  it("does not reload for the directory's own creation", async () => {
    // Given a directory mounted the moment it was made, which is what a
    // process that builds its site before mounting it does. macOS replays the
    // directory's own creation to a watch started that soon after it.
    const site = await MountedSite.of({ fresh: true });

    try {
      // When the writes that were in flight have had time to arrive
      await mountPause(500);

      // Then the browser has not been reloaded for a build that never happened
      assertIdentical(site.reloadCount(), 0);

      // And the watch is live rather than broken: a real build still reloads
      await site.write("index.html", "<h1>Built</h1>");
      await site.reloaded();
      assertIdentical(site.reloadCount(), 1);
    } finally {
      site.stop();
    }
  });

  it("stops watching when the watch is closed", async () => {
    // Given a mounted directory whose watch has been stopped, as a test that
    // is finished with it does
    const site = await MountedSite.of();
    site.stop();

    // When a build writes a page into it afterwards
    await site.write("index.html", "<h1>Rebuilt</h1>");
    await mountPause(500);

    // Then nothing is left listening for it
    assertIdentical(site.reloadCount(), 0);
    assertArrayEquals(site.simAws.s3().watchedMountedDirectories(), []);
  });
});
