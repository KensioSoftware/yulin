import path from "node:path";
import { assertIdentical, assertUndefined } from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimWatchEventPath } from "./sim-watch-event-path.js";
import { repoPath } from "../../util/filesystem/path.js";
import { TemporaryDirectory } from "../../util/filesystem/temporary-directory.js";

describe("SimWatchEventPath", () => {
  it("joins a file name onto the directory being watched", () => {
    // Given a recursive watch on a project
    const eventPath = new SimWatchEventPath(repoPath(), true);

    // When an event names a file in it
    const changedPath = eventPath.of(path.join("src", "index.ts"));

    // Then that file is what changed
    assertIdentical(changedPath, repoPath(path.join("src", "index.ts")));
  });

  it("takes a nameless event on a directory to be about the directory", () => {
    // Given a recursive watch on a project
    const eventPath = new SimWatchEventPath(repoPath(), true);

    // When an event arrives with no file name
    const changedPath = eventPath.of(null);

    // Then there is nothing to restart for, since an edit names its own file
    assertUndefined(changedPath);
  });

  it("takes an empty name on a directory to be about the directory", () => {
    // Given a recursive watch on a project
    const eventPath = new SimWatchEventPath(repoPath(), true);

    // When an event arrives with an empty file name
    const changedPath = eventPath.of("");

    // Then there is nothing to restart for
    assertUndefined(changedPath);
  });

  it("takes the directory's own name to be about the directory", () => {
    // Given a recursive watch on a project, which macOS reports changes to by
    // the directory's own name rather than with no name at all
    const eventPath = new SimWatchEventPath(repoPath(), true);

    // When an event names the directory itself
    const changedPath = eventPath.of(path.basename(repoPath()));

    // Then it is passed over, since no such file is in there
    assertUndefined(changedPath);
  });

  it("keeps a real file named after the directory it is in", async () => {
    // Given a directory holding a file of its own name, which is unusual but
    // allowed, and a recursive watch on it
    const directory = new TemporaryDirectory();
    await directory.resolvePath();
    const name = path.basename(directory.path());
    await directory.writeFile(name, "content");
    const eventPath = new SimWatchEventPath(directory.path(), true);

    // When an event names it
    const changedPath = eventPath.of(name);

    // Then it is a file that exists, so it is a change like any other
    assertIdentical(changedPath, directory.join(name));
  });

  it("takes any event on a watched file to be about that file", () => {
    // Given a watch on one synthesized template
    const templatePath = repoPath("cdk.out/Stack.template.json");
    const eventPath = new SimWatchEventPath(templatePath, false);

    // When an event arrives, however it names the file
    const changedPath = eventPath.of("Stack.template.json");

    // Then the file being watched is the file that changed
    assertIdentical(changedPath, templatePath);
  });
});
