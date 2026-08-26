/**
 * Spike addendum. Can the parser be an optional peer dependency?
 *
 * Users who never run a query pay nothing, and a user who opts the engine on
 * without installing it is told what to install.
 */

/** What the engine needs from the parser package. */
export interface AthenaParser {
  astify(sql: string, options: { database: string }): unknown;
  sqlify(ast: unknown, options: { database: string }): string;
  tableList(sql: string, options: { database: string }): string[];
}

export class SimAthenaParserMissing extends Error {
  constructor(cause: unknown) {
    super(
      "Simulated Athena needs node-sql-parser to run a query. " +
        "Add it to your project as a dev dependency, or leave the engine off " +
        "and declare what each query answers with through results(). " +
        `The import failed with ${String((cause as Error).message).split("\n")[0]}`,
    );
    this.name = "SimAthenaParserMissing";
  }
}

/**
 * Load the parser, or say what to install.
 */
export async function loadAthenaParser(
  specifier = "node-sql-parser/build/athena",
): Promise<AthenaParser> {
  let loaded: Record<string, unknown>;

  try {
    loaded = (await import(specifier)) as Record<string, unknown>;
  } catch (error) {
    throw new SimAthenaParserMissing(error);
  }

  const exported = loaded as {
    Parser?: new () => AthenaParser;
    default?: { Parser?: new () => AthenaParser };
  };
  const Parser = exported.Parser ?? exported.default?.Parser;

  if (Parser === undefined) {
    throw new SimAthenaParserMissing(
      new Error("the package exported no Parser"),
    );
  }

  return new Parser();
}

const parser = await loadAthenaParser();

console.log("single-dialect subpath loaded:", parser.constructor.name);
console.log(
  "tableList:",
  parser.tableList("SELECT a FROM rainlytics.access_logs", {
    database: "athena",
  }),
);
console.log(
  "sqlify:",
  parser.sqlify(
    parser.astify("SELECT a FROM rainlytics.t WHERE b > 1", {
      database: "athena",
    }),
    { database: "sqlite" },
  ),
);

try {
  await loadAthenaParser("node-sql-parser-that-is-not-installed");
} catch (error) {
  console.log("");
  console.log("when it is absent:");
  console.log((error as Error).message);
}
