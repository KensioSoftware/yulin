/* oxlint-disable no-template-curly-in-string -- Fn::Sub syntax, not JavaScript templates. */
import path from "node:path";
import {
  assertArrayEquals,
  assertIdentical,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { TemporaryDirectory } from "../../../util/filesystem/temporary-directory.js";
import type { SimCloudFormationStackName } from "../stack/sim-cfn-stack.js";
import { SimCfnTemplateFileLoader } from "./sim-cfn-template-file-loader.js";

describe("SimCfnTemplateFileLoader reading a YAML template file", () => {
  it("loads a template file written as YAML, resolving its short-form tags", async () => {
    // Given a hand-written YAML template, as CloudFormation takes one.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "WorkStack.yaml";

    await temporaryDirectory.writeFile(
      templatePath,
      [
        "Resources:",
        "  WorkQueue:",
        "    Type: AWS::SQS::Queue",
        "    Properties:",
        '      QueueName: !Sub "${AWS::StackName}-work"',
      ].join("\n"),
    );

    // When the template file is loaded.
    const fileLoader = new SimCfnTemplateFileLoader();
    const loadedTemplate = await fileLoader.load(
      temporaryDirectory.join(templatePath),
    );

    // Then it holds what the same template written as JSON holds, and the
    // Stack name drops the extension the way a synthesized name does.
    assertIdentical(loadedTemplate.stackName, "WorkStack");
    assertObjectMatches(loadedTemplate.template.Resources, {
      WorkQueue: {
        Properties: { QueueName: { "Fn::Sub": "${AWS::StackName}-work" } },
      },
    });
  });

  it("drops every YAML suffix a template file is named with from the Stack name", async () => {
    // Given the same template under each name a YAML template file carries.
    const temporaryDirectory = new TemporaryDirectory();
    const fileLoader = new SimCfnTemplateFileLoader();
    const stackNames: (SimCloudFormationStackName | string)[] = [];

    // When each of them is loaded.
    for (const fileName of [
      "WorkStack.yml",
      "WorkStack.template.yaml",
      "WorkStack.template.yml",
    ]) {
      // oxlint-disable no-await-in-loop -- one file at a time is the point
      await temporaryDirectory.writeFile(fileName, "Resources: {}\n");
      const loaded = await fileLoader.load(temporaryDirectory.join(fileName));
      // oxlint-enable no-await-in-loop
      stackNames.push(loaded.stackName);
    }

    // Then each Stack is named for the template rather than for the file.
    assertArrayEquals(stackNames, ["WorkStack", "WorkStack", "WorkStack"]);
  });

  it("reports the parse failure for a template file holding invalid YAML, naming the path", async () => {
    // Given a YAML template file that does not parse.
    const temporaryDirectory = new TemporaryDirectory();
    const templatePath = "BrokenStack.yaml";

    await temporaryDirectory.writeFile(
      templatePath,
      "Resources:\n  WorkQueue:\n Type: AWS::SQS::Queue\n",
    );

    // When the template file is loaded.
    const fileLoader = new SimCfnTemplateFileLoader();
    const error = await assertThrowsErrorAsync(async () => {
      await fileLoader.load(temporaryDirectory.join(templatePath));
    });

    // Then the refusal names the resolved path, since where the parser stopped
    // is no use without the file it stopped in.
    assertStringIncludes(
      error.message,
      path.resolve(temporaryDirectory.join(templatePath)),
    );
    assertStringIncludes(error.message, "is not YAML this simulation can read");
  });
});
