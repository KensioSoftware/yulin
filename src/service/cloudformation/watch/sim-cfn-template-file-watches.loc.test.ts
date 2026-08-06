import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import type { SimCloudFormationDeployTemplateFileProperties } from "../deploy/sim-cfn-template-file-loader.js";
import type { SimCfnTemplateFileUpdating } from "../deploy/sim-cfn-template-file-updater.js";
import type { SimCfnStack } from "../stack/sim-cfn-stack.js";
import { SimCfnTemplateFileWatches } from "./sim-cfn-template-file-watches.js";
import { templatePause } from "../../../../test/cloudformation/watched-template.js";

describe("SimCfnTemplateFileWatches", () => {
  it("watches a template file deployed twice once", async () => {
    // Given the same template file deployed twice, as a script that deploys it
    // and is run again in the same process would
    const applied: string[] = [];
    const directory = new TemporaryDirectory();
    await directory.writeFile("Site.template.json", "{}");
    const templatePath = directory.join("Site.template.json");

    // macOS delivers filesystem events with a short delay, so a watch started
    // straight after the file was written still sees that write.
    await templatePause(250);

    const watches = new SimCfnTemplateFileWatches({
      updater: records(applied),
    });

    watches.add({ templatePath }, { settleMs: 100 });
    watches.add({ templatePath, stackName: "SiteAgain" }, { settleMs: 100 });

    try {
      // When it is synthesized again
      await directory.writeFile("Site.template.json", '{"Resources":{}}');
      await templatePause(500);

      // Then it is watched once, by the deployment that is live
      assertArrayEquals([...watches.paths()], [templatePath]);
      assertArrayEquals(applied, ["SiteAgain"]);
    } finally {
      watches.stopAll();
    }
  });

  it("takes no notice of the rest of the cloud assembly", async () => {
    // Given a watched template file in a directory with other stacks and
    // staged assets in it, as a cloud assembly is
    const applied: string[] = [];
    const directory = new TemporaryDirectory();
    await directory.writeFile("Site.template.json", "{}");
    await directory.writeFile("Other.template.json", "{}");
    await templatePause(250);
    const watches = new SimCfnTemplateFileWatches({
      updater: records(applied),
    });
    watches.add(
      { templatePath: directory.join("Site.template.json") },
      { settleMs: 100 },
    );

    try {
      // When another stack in the same directory is synthesized
      await directory.writeFile("Other.template.json", '{"Resources":{}}');
      await templatePause(500);

      // Then this Stack is left alone
      assertArrayEquals(applied, []);
    } finally {
      watches.stopAll();
    }
  });

  it("stops every watch it holds", async () => {
    // Given two template files being watched
    const applied: string[] = [];
    const directory = new TemporaryDirectory();
    await directory.writeFile("One.template.json", "{}");
    await directory.writeFile("Two.template.json", "{}");
    await templatePause(250);
    const watches = new SimCfnTemplateFileWatches({
      updater: records(applied),
    });

    for (const fileName of ["One.template.json", "Two.template.json"]) {
      watches.add(
        { templatePath: directory.join(fileName), stackName: fileName },
        { settleMs: 100 },
      );
    }

    assertArrayLength(watches.paths(), 2);

    // When the watching is stopped and both files change afterwards
    watches.stopAll();
    await directory.writeFile("One.template.json", '{"Resources":{}}');
    await directory.writeFile("Two.template.json", '{"Resources":{}}');
    await templatePause(300);

    // Then nothing is left holding the process open, and nothing is applied
    assertArrayEquals([...watches.paths()], []);
    assertArrayEquals(applied, []);
  });
});

/**
 * An update that records which deployment applied the file, rather than
 * touching simulated AWS.
 */
function records(applied: string[]): SimCfnTemplateFileUpdating {
  return {
    update: async (
      properties: SimCloudFormationDeployTemplateFileProperties,
    ): Promise<SimCfnStack> => {
      applied.push(String(properties.stackName));

      return await Promise.resolve({} as SimCfnStack);
    },
  };
}
