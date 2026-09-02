/**
 * The optional peer dependency shape, measured. hyparquet has to load by
 * dynamic import the way node-sql-parser does, and a project without it has to
 * be told what to add.
 */
import { execSync } from "node:child_process";

const specifier = "hyparquet";

console.log("=== Loading by dynamic import ===");
{
  const module = (await import(specifier)) as Record<string, unknown>;

  console.log(
    `  hyparquet exports parquetReadObjects: ${String(typeof module["parquetReadObjects"] === "function")}`,
  );
}

console.log("\n=== A project without the package ===");
{
  try {
    await import("hyparquet-not-installed");
  } catch (error) {
    console.log(`  import throws ${(error as Error).constructor.name}`);
    console.log(
      "  which is the same shape simAthenaSqlParser already turns into a",
    );
    console.log("  SimAthenaSetUpError naming what to add.");
  }
}

console.log("\n=== Install cost ===");
for (const name of ["hyparquet", "node-sql-parser"]) {
  const path = execSync(
    `ls -d node_modules/.pnpm/${name}@*/ 2>/dev/null | head -1`,
  )
    .toString()
    .trim();
  const size = execSync(`du -sk ${path}`).toString().split("\t")[0] ?? "0";
  const meta = JSON.parse(
    execSync(`cat node_modules/${name}/package.json`).toString(),
  ) as { version: string; license: string; dependencies?: object };

  console.log(
    `  ${name.padEnd(16)} ${meta.version.padEnd(8)} ${meta.license.padEnd(12)}` +
      ` ${(Number(size) / 1024).toFixed(1).padStart(6)} MB` +
      ` ${String(Object.keys(meta.dependencies ?? {}).length)} dependencies`,
  );
}
