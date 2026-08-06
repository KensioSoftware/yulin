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
    assertStringIncludes(stdout, "watch [--inspect");
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
    await runFile("pnpm", ["tsx", binPath, ...commandArguments], {
      cwd: repoPath(),
    });
  } catch (error) {
    const failed = error as { code?: number; stderr?: string };

    return { code: failed.code ?? 0, stderr: failed.stderr ?? "" };
  }

  throw new Error("Expected the command to fail");
}
