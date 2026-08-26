import sqlParser from "node-sql-parser";

const { Parser } = sqlParser;
const parser = new Parser();

const probes: [string, string][] = [
  ["offset-after-limit", `SELECT url FROM t ORDER BY url LIMIT 5 OFFSET 2`],
  ["offset-before-limit", `SELECT url FROM t ORDER BY url OFFSET 2 LIMIT 5`],
  ["try-cast", `SELECT try_cast(status AS VARCHAR) FROM t`],
  ["cast", `SELECT CAST(status AS VARCHAR) FROM t`],
  ["grouping-sets", `SELECT a, count(*) FROM t GROUP BY GROUPING SETS ((a))`],
  ["rollup", `SELECT a, count(*) FROM t GROUP BY ROLLUP (a)`],
  [
    "unnest",
    `SELECT e.id, t.tag FROM app.events e CROSS JOIN UNNEST(tags) AS t(tag)`,
  ],
];

for (const [label, sql] of probes) {
  try {
    const ast = parser.astify(sql, { database: "athena" });
    console.log(
      label.padEnd(20),
      "parse OK ->",
      parser.sqlify(ast, { database: "sqlite" }).slice(0, 95),
    );
  } catch (error) {
    console.log(
      label.padEnd(20),
      "parse FAIL",
      String((error as Error).message)
        .replaceAll("\n", " ")
        .slice(0, 55),
    );
  }
}
