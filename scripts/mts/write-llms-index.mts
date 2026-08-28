#!/usr/bin/env -S pnpm tsx

/**
 * Writes the published `llms.txt` into the package root from the links in
 * `docs/README.md`.
 *
 * The package carries its documentation as markdown, and this index is how a
 * reader finds one page without opening every one of them. It sits in the
 * package root because that is where the same file sits on the website, and
 * because a coding agent hunting for one has a single path to try.
 *
 * Generating it from `docs/README.md` keeps the repository to one list of
 * pages. A page added there reaches the index, and a page nothing links to
 * fails this script.
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { findReadmes } from "./documentation-readmes.mjs";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const documentationDirectory = path.join(projectRoot, "docs");
const outputPath = path.join(projectRoot, "llms.txt");

/** The website, and the prefix every link in `docs/README.md` carries. */
const siteOrigin = "https://yulinsim.dev/";

/** The list this index is generated from, and the one page it leaves out. */
const indexPage = "docs/README.md";

const preamble = `# Yulin

> AWS system behaviour simulation for isolated unit testing.

The pages below ship with the package as markdown, and they document the version
installed. Paths are relative to the package root, which an installed project
has at \`node_modules/@kensio/yulin/\`.

The same pages are on the web at ${siteOrigin} for whichever release is current.
`;

interface DocumentationLink {
  readonly title: string;
  readonly filePath: string;
  readonly description: string | undefined;
}

interface DocumentationSection {
  readonly heading: string;
  readonly links: DocumentationLink[];
}

async function main(): Promise<void> {
  const markdown = await readFile(path.join(projectRoot, indexPage), "utf8");
  const sections = parseSections(markdown);

  await assertIndexIsComplete(sections);

  await writeFile(outputPath, render(sections), "utf8");

  // This runs inside `prepack`, where `npm pack --json` gives its own output
  // on stdout, and anything said there would be parsed as part of it.
  console.error(`Wrote ${path.relative(projectRoot, outputPath)}.`);
}

/** The `##` sections of `docs/README.md`, and the doc links under each one. */
function parseSections(markdown: string): readonly DocumentationSection[] {
  const sections: DocumentationSection[] = [];
  const linkPattern = /^- \[([^\]]+)]\(([^)]+)\)/;

  for (const line of markdown.split("\n")) {
    const heading = /^## (.+)$/.exec(line)?.[1];

    if (heading !== undefined) {
      sections.push({ heading, links: [] });
      continue;
    }

    const match = linkPattern.exec(line);
    const section = sections.at(-1);

    if (match === null || section === undefined) {
      continue;
    }

    const [, title, target] = match;

    if (title === undefined || target === undefined) {
      continue;
    }

    const { url, description } = splitLinkTarget(target);
    const filePath = toDocumentationPath(url);

    if (filePath !== undefined) {
      section.links.push({ title, filePath, description });
    }
  }

  return sections.filter((section) => section.links.length > 0);
}

/**
 * Splits what a markdown link holds into the URL and the title attribute.
 *
 * The two are separated by a space, and the title attribute is in quotes. A
 * link written without one gives `undefined` for it.
 */
function splitLinkTarget(target: string): {
  readonly url: string;
  readonly description: string | undefined;
} {
  const separator = target.indexOf(" ");

  if (separator === -1) {
    return { url: target, description: undefined };
  }

  const title = target.slice(separator + 1).trim();
  const quoted = title.startsWith('"') && title.endsWith('"');

  return {
    url: target.slice(0, separator),
    description: quoted ? title.slice(1, -1) : title,
  };
}

/**
 * The package-relative page a website URL stands for.
 *
 * A link pointing anywhere else, such as the specification the AI skill page
 * cites, gives `undefined` and stays out of the index.
 */
function toDocumentationPath(url: string): string | undefined {
  if (!url.startsWith(siteOrigin)) {
    return undefined;
  }

  const slug = url.slice(siteOrigin.length).replace(/\/$/, "");

  return slug === "" ? undefined : `docs/${slug}/README.md`;
}

/**
 * Checks the index against the documentation tree in both directions.
 *
 * A link naming a page the package lacks publishes a dead path. A page nothing
 * links to is one an agent reading the index never finds. Both go wrong at the
 * moment a service is documented, and both are silent everywhere else.
 */
async function assertIndexIsComplete(
  sections: readonly DocumentationSection[],
): Promise<void> {
  const linked = new Set(
    sections.flatMap((section) => section.links.map((link) => link.filePath)),
  );

  const readmePaths = await findReadmes(documentationDirectory);
  const onDisk = new Set(
    readmePaths.map((readmePath) =>
      path.relative(projectRoot, readmePath).split(path.sep).join("/"),
    ),
  );

  onDisk.delete(indexPage);

  const unlinked = onDisk.difference(linked);
  const absent = linked.difference(onDisk);

  if (unlinked.size > 0 || absent.size > 0) {
    throw new Error(
      [
        `${indexPage} and the documentation tree disagree.`,
        ...[...unlinked].map((page) => `  nothing links to ${page}`),
        ...[...absent].map((page) => `  linked, but the tree has no ${page}`),
      ].join("\n"),
    );
  }
}

function render(sections: readonly DocumentationSection[]): string {
  const rendered = sections.map(
    (section) =>
      `## ${section.heading}\n\n${section.links.map(renderLink).join("\n")}\n`,
  );

  return [preamble, ...rendered].join("\n");
}

function renderLink(link: DocumentationLink): string {
  const entry = `- [${link.title}](${link.filePath})`;

  return link.description === undefined
    ? entry
    : `${entry}: ${link.description}`;
}

await main();
