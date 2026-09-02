import {
  assertIdentical,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAthenaParquetReader } from "./sim-athena-parquet-module.js";
import { simAthenaSqlParser } from "./sim-athena-parser-module.js";
import { simAthenaSqliteModule } from "./sim-athena-sqlite-module.js";

describe("loading what the Athena query engine runs on", () => {
  it("says what to add where the parser is not installed", async () => {
    // Given a project without node-sql-parser.
    // When the engine asks for its grammar.
    const error = await assertThrowsErrorAsync(async () =>
      simAthenaSqlParser("node-sql-parser/build/absent.js"),
    );

    // Then it names the package to add and the alternative to it.
    assertIdentical(error.name, "SimAthenaSetUpError");
    assertStringIncludes(error.message, "node-sql-parser");
    assertStringIncludes(error.message, "results()");
  });

  it("says the same where the grammar carries no parser", async () => {
    // Given a module that resolves and is not the grammar.
    // When the engine asks it for a parser.
    const error = await assertThrowsErrorAsync(async () =>
      simAthenaSqlParser("node:util"),
    );

    // Then it says which module let it down.
    assertStringIncludes(error.message, "node:util carries no Parser");
  });

  it("says what to add where the Parquet reader is not installed", async () => {
    // Given a project without hyparquet.
    // When a query reaches a Parquet table.
    const error = await assertThrowsErrorAsync(async () =>
      simAthenaParquetReader("hyparquet-absent-from-this-project"),
    );

    // Then it names the package to add and the alternative to it.
    assertIdentical(error.name, "SimAthenaSetUpError");
    assertStringIncludes(error.message, "hyparquet");
    assertStringIncludes(error.message, "results()");
  });

  it("says the same where the package carries no reader", async () => {
    // Given a module that resolves and is not the reader.
    // When the engine asks it to read a Parquet file.
    const error = await assertThrowsErrorAsync(async () =>
      simAthenaParquetReader("node:util"),
    );

    // Then it says which module let it down.
    assertStringIncludes(
      error.message,
      "node:util carries no parquetReadObjects",
    );
  });

  it("swallows SQLite's experimental warning and nothing else", async () => {
    // Given a project handling its own process warnings.
    const seen: string[] = [];
    const listener = (warning: Error): void => {
      seen.push(warning.message);
    };

    process.on("warning", listener);

    try {
      // When the engine loads node:sqlite and something else warns while it
      // is loading, which is the window the swap is in place for.
      const loading = simAthenaSqliteModule();

      process.emitWarning("a warning the project should still see");
      await loading;
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
    } finally {
      process.removeListener("warning", listener);
    }

    // Then the project's own handling survived the swap.
    assertIdentical(seen.at(-1), "a warning the project should still see");
  });
});
