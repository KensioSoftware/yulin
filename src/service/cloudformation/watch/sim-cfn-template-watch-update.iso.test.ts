import {
  assertArrayEquals,
  assertIdentical,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, expect, it, vi } from "vitest";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import type { SimCfnTemplateFileUpdating } from "../deploy/sim-cfn-template-file-updater.js";
import { SimCloudFormationValidationError } from "../error/sim-cloudformation.error.js";
import { simCfnNoUpdatesMessage } from "../stack/update/sim-cfn-stack-updater.js";
import { SimCfnTemplateWatchUpdate } from "./sim-cfn-template-watch-update.js";
import type { SimCfnTemplateFileWatchOptions } from "./sim-cfn-template-watch.type.js";

const templatePath = "/cdk.out/Site.template.json";

describe("SimCfnTemplateWatchUpdate", () => {
  it("says the Stack was updated once the update has finished", async () => {
    // Given a watched template file whose update succeeds
    const updated: string[] = [];
    const update = watchUpdate(succeeds(), {
      onUpdated: () => {
        updated.push("reloaded");
      },
    });

    // When the changed file is applied
    await update.apply();

    // Then whatever was waiting on the update, such as reloading a page, runs
    assertArrayEquals(updated, ["reloaded"]);
  });

  it("does nothing for a file written without being changed", async () => {
    // Given a template file the Stack refuses as an update with nothing in it
    const updated: string[] = [];
    const failures: Error[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const update = watchUpdate(
      refuses(new SimCloudFormationValidationError(simCfnNoUpdatesMessage)),
      {
        onUpdated: () => {
          updated.push("reloaded");
        },
        onFailed: (error) => {
          failures.push(error);
        },
      },
    );

    // When it is applied
    await update.apply();

    // Then a save that changed nothing is a no-op rather than news
    assertArrayEquals(updated, []);
    assertArrayEquals(failures, []);
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports an update the changed template did not survive", async () => {
    // Given a template file whose update fails
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const update = watchUpdate(refuses(new Error("Bucket name is taken")), {});

    // When it is applied
    await update.apply();

    // Then the reason is on the terminal, since the Resources serving are the
    // ones from before the change
    expect(warn).toHaveBeenCalledOnce();
    assertStringIncludes(warn.mock.calls[0]?.[0] as string, templatePath);
    assertStringIncludes(
      warn.mock.calls[0]?.[0] as string,
      "Bucket name is taken",
    );
  });

  it("hands a failed update to onFailed instead of the terminal", async () => {
    // Given a watch with somewhere of its own for a failure to go
    const failures: Error[] = [];
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const update = watchUpdate(refuses(new Error("Bucket name is taken")), {
      onFailed: (error) => {
        failures.push(error);
      },
    });

    // When the update fails
    await update.apply();

    // Then the failure goes there and nothing is written
    assertIdentical(failures.at(0)?.message, "Bucket name is taken");
    expect(warn).not.toHaveBeenCalled();
  });

  it("reports an onUpdated callback that throws, and stays usable", async () => {
    // Given a watch whose onUpdated throws
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const update = watchUpdate(succeeds(), {
      onUpdated: () => {
        throw new Error("the server is closed");
      },
    });

    // When the update succeeds and the callback fails
    await update.apply();

    // Then it is said separately, because the Stack did change
    assertStringIncludes(
      warn.mock.calls[0]?.[0] as string,
      "the onUpdated callback threw: the server is closed",
    );
  });
});

function watchUpdate(
  updater: SimCfnTemplateFileUpdating,
  options: SimCfnTemplateFileWatchOptions,
): SimCfnTemplateWatchUpdate {
  return new SimCfnTemplateWatchUpdate({
    templatePath,
    deployment: { templatePath },
    updater,
    options,
  });
}

/**
 * An update of the template file that applies cleanly.
 */
function succeeds(): SimCfnTemplateFileUpdating {
  return {
    update: async (): Promise<SimCfnStack> => {
      return await Promise.resolve({} as SimCfnStack);
    },
  };
}

/**
 * An update of the template file the Stack refuses, or that fails part way.
 */
function refuses(error: Error): SimCfnTemplateFileUpdating {
  return {
    update: async (): Promise<SimCfnStack> => {
      await Promise.resolve();

      throw error;
    },
  };
}
