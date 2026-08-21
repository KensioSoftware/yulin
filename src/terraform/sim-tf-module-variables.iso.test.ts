import { describe, it } from "vitest";
import {
  assertArrayEquals,
  assertMapSize,
  assertUndefined,
} from "@kensio/smartass";
import { terraformModuleVariables } from "./sim-tf-module-variables.js";

describe("indexing the variables a plan's module calls set", () => {
  it("indexes nothing for a plan holding no configuration", () => {
    // Given a plan document with no configuration section
    // When its module variables are indexed
    // Then there are none, rather than an error
    assertMapSize(terraformModuleVariables({}), 0);
  });

  it("indexes what a call set a variable to", () => {
    // Given a call setting a variable from another module's output
    const plan = {
      configuration: {
        root_module: {
          module_calls: {
            api: {
              module: {},
              expressions: {
                routes: {
                  references: [
                    "module.processor.lambda_function_arn",
                    "module.processor",
                  ],
                },
              },
            },
          },
        },
      },
    };

    // When the variables are indexed
    // Then the references the caller wrote are filed under the call path, so a
    // resource inside the module can find what its own `var.routes` holds
    assertArrayEquals(
      terraformModuleVariables(plan).get("module.api.var.routes"),
      ["module.processor.lambda_function_arn", "module.processor"],
    );
  });

  it("indexes a variable set to a constant as referring to nothing", () => {
    // Given a call setting a variable to a literal
    const plan = {
      configuration: {
        root_module: {
          module_calls: {
            api: { expressions: { name: { constant_value: "orders-api" } } },
          },
        },
      },
    };

    // When the variables are indexed
    // Then the variable is there and refers to nothing. Terraform resolved the
    // value itself, and a resource reading it needs no reference followed
    assertArrayEquals(
      terraformModuleVariables(plan).get("module.api.var.name"),
      [],
    );
  });

  it("indexes a variable of a call made by another module", () => {
    // Given a module whose own call sets a variable of the module below it
    const plan = {
      configuration: {
        root_module: {
          module_calls: {
            platform: {
              module: {
                module_calls: {
                  api: {
                    expressions: { routes: { references: ["var.routes"] } },
                  },
                },
              },
            },
          },
        },
      },
    };

    // When the variables are indexed
    // Then the nested call is filed under its full path, and what it was set
    // from is itself a variable of the module making the call
    assertArrayEquals(
      terraformModuleVariables(plan).get(
        "module.platform.module.api.var.routes",
      ),
      ["var.routes"],
    );
    assertUndefined(
      terraformModuleVariables(plan).get("module.api.var.routes"),
    );
  });
});
