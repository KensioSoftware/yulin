import { describe, it } from "vitest";
import { assertMapSize } from "@kensio/smartass";
import { terraformModuleOutputs } from "./sim-tf-module-outputs.js";

describe("indexing the outputs a plan's modules declare", () => {
  it("indexes nothing for a plan holding no configuration", () => {
    // Given a plan document with no configuration section, which is what an
    // apply of nothing looks like
    // When its outputs are indexed
    // Then there are none, rather than an error
    assertMapSize(terraformModuleOutputs({}), 0);
  });

  it("steps over a module call the configuration says nothing about", () => {
    // Given a module call the configuration names without holding the module
    const plan = {
      configuration: { root_module: { module_calls: { processing: {} } } },
    };

    // When its outputs are indexed
    // Then there are none, because there is no module to read them from
    assertMapSize(terraformModuleOutputs(plan), 0);
  });

  it("indexes an output declared with no expression", () => {
    // Given a module output the configuration holds no expression for
    const plan = {
      configuration: {
        root_module: {
          module_calls: {
            processing: { module: { outputs: { queue_arn: {} } } },
          },
        },
      },
    };

    // When its outputs are indexed
    // Then the output is there, referring to nothing
    assertMapSize(terraformModuleOutputs(plan), 1);
  });
});
