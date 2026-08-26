import { SimAthenaSetUpError } from "../error/sim-athena.error.js";

/**
 * The two things the engine needs out of `node-sql-parser`.
 *
 * `astify` reads Athena's dialect and `sqlify` writes the same statement back
 * out for SQLite. The AST in between is the library's own and is never read
 * here, so it stays opaque.
 */
export interface SimAthenaSqlParser {
  astify(sql: string, options: { database: string }): unknown;
  sqlify(ast: unknown, options: { database: string }): string;
}

interface SimAthenaParserModule {
  readonly Parser?: new () => SimAthenaSqlParser;
  readonly default?: { readonly Parser: new () => SimAthenaSqlParser };
}

/**
 * Where the Athena grammar sits inside the package.
 *
 * The package publishes one build per dialect and no `exports` map, so this
 * deep path pulls the Athena grammar alone rather than all twenty. It is held
 * as a variable rather than written into the `import()` so that building this
 * repository never turns an optional dependency into a required one.
 */
const athenaGrammar = "node-sql-parser/build/athena.js";

const missingPackage =
  `Simulated Athena needs node-sql-parser to run a query. Add it to your ` +
  `project as a dev dependency, or leave the engine off and declare what ` +
  `each query answers with through results().`;

/**
 * The SQL parser, loaded when a test turns the engine on.
 *
 * `node-sql-parser` is an optional peer dependency, so a project that never
 * runs a query never installs it. That is why the import is dynamic and why a
 * failure to resolve it is reported as something to go and add.
 *
 * The grammar is a parameter so that a test can ask for one that is not
 * installed and read what a project without the package is told.
 */
export async function simAthenaSqlParser(
  grammar: string = athenaGrammar,
): Promise<SimAthenaSqlParser> {
  const module = await importedGrammar(grammar);
  const Parser = module.Parser ?? module.default?.Parser;

  if (Parser === undefined) {
    throw new SimAthenaSetUpError(
      `${grammar} carries no Parser. ${missingPackage}`,
    );
  }

  return new Parser();
}

async function importedGrammar(
  grammar: string,
): Promise<SimAthenaParserModule> {
  try {
    return (await import(grammar)) as SimAthenaParserModule;
  } catch (error) {
    const setUp = new SimAthenaSetUpError(missingPackage);

    setUp.cause = error;

    throw setUp;
  }
}
