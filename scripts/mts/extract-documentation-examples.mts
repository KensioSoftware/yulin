#!/usr/bin/env -S pnpm tsx

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const documentationDirectory = path.join(projectRoot, "docs");

interface ExtractedExample {
  readonly label: string;
  readonly code: string;
}

async function main(): Promise<void> {
  const readmePaths = await findReadmes(documentationDirectory);

  for (const readmePath of readmePaths) {
    const markdown = await readFile(readmePath, "utf8");
    const examples = extractTypescriptExamples(markdown);

    if (examples.length === 0) {
      continue;
    }

    const readmeDirectory = path.dirname(readmePath);

    for (const example of examples) {
      const fileName = `${example.label}.example.ts`;
      const outputPath = path.join(readmeDirectory, fileName);

      await writeFile(outputPath, `${example.code.trimEnd()}\n`, "utf8");
    }
  }
}

async function findReadmes(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const readmePaths: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      readmePaths.push(...(await findReadmes(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name === "README.md") {
      readmePaths.push(entryPath);
    }
  }

  return readmePaths;
}

function extractTypescriptExamples(
  markdown: string,
): readonly ExtractedExample[] {
  const examples: ExtractedExample[] = [];
  const codeBlockRegex =
    /(?:^|\n)```(?:typescript|ts)[\t ]+([\w.-]+)[^\n]*\n([\S\s]*?)\n```(?=\n|$)/g;

  for (const match of markdown.matchAll(codeBlockRegex)) {
    const [, label, code] = match;

    if (label === undefined || code === undefined) {
      continue;
    }

    examples.push({
      label,
      code,
    });
  }

  return examples;
}

await main();
