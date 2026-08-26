# Athena SQL through SQLite (spike for #1004)

Throwaway. Nothing here is shaped for production, and the branch it sits on is meant to be deleted once the follow-up issues are filed.

Run it with `pnpm tsx spike/end-to-end.ts`, `pnpm tsx spike/corpus-run.ts` and `pnpm tsx spike/divergence.ts`.

## What ran

`end-to-end.ts` deploys a Glue database and table from a CloudFormation template, seeds five JSON lines rows into simulated S3 under two Hive style partition prefixes, reads the table's metadata back out of the catalog, loads the objects into an in-memory SQLite database built from the Glue column types, and answers this query with them.

```sql
SELECT url, count(*) AS hits, sum(bytes) AS total
FROM rainlytics.access_logs
WHERE status >= 400 AND day = '2026-08-01'
GROUP BY 1 ORDER BY hits DESC
```

The rows come back through `GetQueryResults` on the real query lifecycle, and `DataScannedInBytes` reports 343, measured from the objects the query read. The partition predicate filtered on a column that exists only in the S3 key path.

One piece is stitched. The engine computes the result and the spike installs it through `results().onQuery` before starting the execution. Cutting the seam in `SimAthenaQueryRunner` is #1008's work, and the spike avoided touching `src/`.

## The number

**38 of 40** corpus queries parse with the `athena` dialect and then run under SQLite. Without the shim layer it is 35 of 40.

The corpus in `corpus.ts` holds the query shapes a Yulin user would write against access logs, orders and events. Aggregates, `GROUP BY`, `HAVING`, `CASE`, `BETWEEN`, `IN`, `LIKE`, `DISTINCT`, `count(DISTINCT)`, CTEs, inner and left joins, subqueries in `FROM` and in `IN`, `NOT EXISTS`, `UNION ALL`, two window functions, casts, six date and JSON functions, and `OFFSET` all work.

Two failures are left standing.

| Construct       | Stage   | Why                                                                                                                 |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `UNNEST`        | execute | Parses, and `sqlify` emits `CROSS JOIN UNNEST(...)` that SQLite rejects. A rewrite onto `json_each` would close it. |
| `GROUPING SETS` | parse   | The `athena` grammar refuses it. `ROLLUP` parses.                                                                   |

Three more failed at first and three cheap rewrites closed them. `try_cast(x AS T)` became `CAST(x AS T)`, Trino's `OFFSET n LIMIT m` was reordered into SQLite's `LIMIT m OFFSET n`, and `approx_percentile` became an aggregate shim. `try_cast` is the one that changes meaning, and it changes it in the forgiving direction, since SQLite already answers with a value where a cast fails.

## Divergences that answer differently

These are the ones worth care. A refusal is loud and a wrong answer is quiet. SQLite's column was measured by `divergence.ts`. The Athena column comes from the Trino documentation and was not executed, so each row is a claim to check before it reaches a docs page.

| Case                                                               | SQLite          | Athena             | Verdict                                                                                                                                                                              |
| ------------------------------------------------------------------ | --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LIKE 'alpha'` against `'Alpha'`                                   | matches         | no match           | **Fixed.** `PRAGMA case_sensitive_like = ON` closes it, verified. This was the most dangerous one, since a filter silently matching more rows passes a test and fails in production. |
| `ORDER BY n ASC` with nulls                                        | nulls first     | nulls last         | **Fixed by a rewrite.** Emitting `ASC NULLS LAST` closes it, verified. Descending already agrees.                                                                                    |
| A boolean column or expression                                     | `1` and `0`     | `true` and `false` | **Fixed by formatting.** The Glue column type says which columns are boolean, and the result formatter renders them.                                                                 |
| `approx_percentile`, `approx_distinct`                             | shimmed exactly | approximate        | **Left standing.** The simulation is more accurate than AWS. Harmless at fixture scale.                                                                                              |
| `1 / 0`                                                            | `NULL`          | query fails        | **Left standing.** Simulated Athena accepts a query real Athena refuses, which is the looser-than-AWS divergence `CLAUDE.md` warns about.                                            |
| `CAST('abc' AS INTEGER)`                                           | `0`             | query fails        | **Left standing.** Same shape. It is also what makes the `try_cast` rewrite roughly right.                                                                                           |
| `1 \|\| 'x'`                                                       | `'1x'`          | query fails        | **Left standing.** Same shape.                                                                                                                                                       |
| `5 / 2`, `round(0.5)`, `avg` of integers, `-7 % 3`, `length(NULL)` | agree           | agree              | No divergence found.                                                                                                                                                                 |

The three left standing are all the simulation accepting something AWS refuses. None of them changes an answer a passing query gives.

## The dependency

`node-sql-parser` 5.4.0, Apache-2.0. It carries an `athena` dialect and a `sqlify` that re-emits for SQLite, and both did the work here.

The cost is the install. 88MB materialised in the pnpm store, of which 30 source map files are the bulk. That is more than three times the size of yulin itself, and most users will never run a query.

So it goes in as an optional peer dependency, and the docs tell a user to add it when they want the engine.

```json
"peerDependencies": { "node-sql-parser": "^5.4.0" },
"peerDependenciesMeta": { "node-sql-parser": { "optional": true } }
```

`optional-dependency.ts` proves the shape out. Installing a package that declares it leaves `node_modules` without the parser under both npm and pnpm, measured, and pnpm prints no missing-peer warning. Yulin keeps its own devDependency on the parser so its own tests can run the engine.

The engine then loads through a dynamic `import()` on the first query, since the runner is already async. A user who turns the engine on without the package gets this.

```
Simulated Athena needs node-sql-parser to run a query. Add it to your project as a
dev dependency, or leave the engine off and declare what each query answers with
through results().
```

Loading is by specifier `node-sql-parser/build/athena`, which resolves under ESM and carries the one grammar at 192KB. The package is CommonJS, and the `Parser` comes off either the module namespace or its default export.

The engine has to be opt-in. A project holding the parser for an unrelated reason would otherwise find simulated Athena answering queries differently from the version before it.

`dt-sql-parser` was the alternative, with a real ANTLR Trino grammar at 20MB and an MIT licence. Its published build uses directory imports and fails to resolve under Node ESM by either `import` or `require`, so it is out until upstream fixes it.

## `node:sqlite`

Built into Node 24, which `engines` already requires. `DatabaseSync` gave `exec`, `prepare`, `function` and `aggregate`, and all four were used. `ATTACH ':memory:' AS <name>` gives one SQLite schema per Glue database, so `db.table` resolves with no renaming.

It prints `ExperimentalWarning: SQLite is an experimental feature` on first import. `warning-suppression.ts` shows the warning can be swallowed without taking a user's own warning handling with it, by swapping the `warning` listeners around the import and restoring them a tick later. The delivery is deferred through `process.emitWarning`, so restoring synchronously misses it.

`DatabaseSync` is synchronous and blocks the event loop for the length of a query. At fixture scale that is nothing, and it suits the deterministic background scheduler.

## Cost

The whole throwaway engine is 379 lines, covering S3 loading, Hive partition parsing, SQLite construction, the shims and the translation. The shim layer inside it is about 120 lines and covers fourteen Trino scalar functions and two aggregates. A further shim is roughly five lines.

That is the measurement the recommendation rests on. The hand-written engine #1008 was originally sized against would have been 4,000 to 7,000 lines.

## Recommendation

Take the dependency and build the engine, with the parser as an optional peer dependency nobody installs by default.

The realism ceiling to document is that simulated Athena runs the query under SQLite, that it answers roughly nineteen queries in twenty of the shapes a test writes, that a query it cannot run falls back to the declared result, and that it accepts three classes of expression real Athena refuses. Every case where it answers a query differently was closable, and all three closures are verified here.

The escape hatch stays as #992 shipped it, and the execution reports which of the two answered.

## Follow-ups

#1008 stands as filed, with these amendments worth making before it is picked up.

- The parser is an optional peer dependency, loaded by dynamic import from `node-sql-parser/build/athena`, and the engine is opt-in.
- A missing parser raises the message above, naming what to install.
- `PRAGMA case_sensitive_like = ON` and the `ASC NULLS LAST` rewrite both belong in the acceptance criteria. Each closes a case where a query answers differently.
- Boolean rendering from the Glue column type belongs beside the type mapping criterion.
- The three looser-than-AWS divergences belong in the docs page's Limitations list, named.

Two follow-ups are worth filing on top.

- `UNNEST` rewritten onto `json_each`, which is what an events table with an array column needs.
- The Trino function library beyond the fourteen shimmed here, filed as it is asked for.
