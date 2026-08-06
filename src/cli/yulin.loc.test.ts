import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { assertIdentical, assertStringIncludes } from "@kensio/smartass";
import { describe, it } from "vitest";
import { repoPath } from "../util/filesystem/path.js";

const runFile = promisify(execFile);
const binPath = path.join(repoPath(), "src", "cli", "yulin.ts");

/**
 * The `yulin` command as a command, run the way a shell runs it. Everything it
 * decides is covered elsewhere; this is that the entry point itself works.
 */
describe("yulin command line", () => {
  it("lists what it can do", async () => {
    // Given the command run with no arguments
    // When it is asked for help
    const { stdout } = await runFile("pnpm", ["tsx", binPath, "--help"], {
      cwd: repoPath(),
    });

    // Then the commands are listed
    assertStringIncludes(stdout, "watch [options]");
  });

  it("stops when the command to watch cannot be run", async () => {
    // Given a watch of a command that is not there, which is what a typo looks
    // like on the first run
    // When it is run
    const failure = await commandFailure([
      "watch",
      "--",
      "definitely-not-a-command",
    ]);

    // Then it says so and exits, rather than sitting there watching for a
    // change with nothing to run when one arrives
    assertIdentical(failure.code, 1);
    assertStringIncludes(failure.stderr, "definitely-not-a-command");
  });

  it("reports a command it does not have", async () => {
    // Given a command that does not exist
    // When it is run
    const failure = await commandFailure(["deploy"]);

    // Then it says so on standard error, and exits non-zero
    assertIdentical(failure.code, 1);
    assertStringIncludes(failure.stderr, "Unknown command deploy.");
  });
});

interface CommandFailure {
  readonly code: number;
  readonly stderr: string;
}

async function commandFailure(
  commandArguments: readonly string[],
): Promise<CommandFailure> {
  try {
    // The timeout is what tells a command that reported an error and exited
    // apart from one that reported it and then sat there.
    await runFile("pnpm", ["tsx", binPath, ...commandArguments], {
      cwd: repoPath(),
      timeout: 15_000,
    });
  } catch (error) {
    const failed = error as {
      code?: number;
      stderr?: string;
      killed?: boolean;
    };

    if (failed.killed === true) {
      throw new Error("The command did not exit on its own", { cause: error });
    }

    return { code: failed.code ?? 0, stderr: failed.stderr ?? "" };
  }

  throw new Error("Expected the command to fail");
}
