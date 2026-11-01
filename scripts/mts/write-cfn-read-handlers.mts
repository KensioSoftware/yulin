#!/usr/bin/env -S pnpm tsx

/**
 * Writes the snapshot of CloudFormation read handler permissions that sim
 * CloudFormation authorizes against a deployment's caller.
 *
 * Two published AWS sources go into it. The CloudFormation registry schemas
 * name the IAM actions each Resource type's read handler may call. The Service
 * Authorization Reference names the resource type each action is decided on,
 * and that resource type's ARN format. The schemas carry no ARNs, so neither
 * source is enough alone.
 *
 * Only the actions in the Resource type's own service are kept, and only those
 * decided on the Resource itself or on no resource at all. The registry lists
 * every call a handler might make, and the calls into other services are the
 * conditional ones (a KMS key, a role a property names). See the Limitations
 * of docs/cloudformation.md.
 *
 * The snapshot is committed, because a test cannot fetch it. Run this to move
 * it on, with `pnpm run cfn:read-handlers`.
 */

import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const projectRoot = path.resolve(import.meta.dirname, "../..");

const outputPath = path.join(
  projectRoot,
  "src/service/cloudformation/registry/sim-cfn-read-handlers.json",
);

// us-east-1 publishes the most Resource types.
const schemaRegion = "us-east-1";
const schemaUrl = `https://schema.cloudformation.${schemaRegion}.amazonaws.com/CloudformationSchema.zip`;
const serviceReferenceUrl = "https://servicereference.us-east-1.amazonaws.com";

interface RegistrySchema {
  readonly typeName: string;
  readonly handlers?: {
    readonly read?: { readonly permissions?: readonly string[] };
  };
}

interface ServiceReference {
  readonly Actions: readonly {
    readonly Name: string;
    readonly Resources?: readonly { readonly Name: string }[];
  }[];
  readonly Resources?: readonly {
    readonly Name: string;
    readonly ARNFormats: readonly string[];
  }[];
}

interface ReadHandler {
  readonly arn: string;
  readonly actions: string[];
  readonly anyResourceActions: string[];
}

/** Lower case with everything but letters and digits removed. */
function normalized(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z\d]/gu, "");
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`${url} answered ${String(response.status)}`);
  }

  return (await response.json()) as T;
}

async function readSchemas(): Promise<RegistrySchema[]> {
  const directory = await mkdtemp(path.join(tmpdir(), "cfn-schemas-"));

  try {
    const response = await fetch(schemaUrl);

    if (!response.ok) {
      throw new Error(`${schemaUrl} answered ${String(response.status)}`);
    }

    const zipPath = path.join(directory, "schemas.zip");
    const body = await response.arrayBuffer();
    await writeFile(zipPath, Buffer.from(body));
    await promisify(execFile)("unzip", ["-q", zipPath, "-d", directory]);

    const entries = await readdir(directory);
    const names = entries.filter((name) => name.endsWith(".json"));

    return await Promise.all(
      names.map(async (name) => {
        const text = await readFile(path.join(directory, name), "utf8");

        return JSON.parse(text) as RegistrySchema;
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/**
 * The Service Authorization Reference, one service at a time, found through
 * the index it publishes. A registry schema sometimes writes an action's
 * service prefix in another case (`Batch:DescribeJobQueues`), and IAM reads
 * prefixes case-insensitively, so the index is keyed in lower case.
 */
class ServiceReferences {
  private index: Promise<Map<string, string>> | undefined;
  private readonly loaded = new Map<string, Promise<ServiceReference>>();

  private static async readIndex(): Promise<Map<string, string>> {
    const services = await fetchJson<{ service: string; url: string }[]>(
      `${serviceReferenceUrl}/`,
    );

    return new Map(services.map(({ service, url }) => [service, url]));
  }

  async get(prefix: string): Promise<ServiceReference | undefined> {
    const urls = await this.urls();
    const url = urls.get(prefix.toLowerCase());

    if (url === undefined) {
      return undefined;
    }

    let reference = this.loaded.get(url);

    if (reference === undefined) {
      reference = fetchJson<ServiceReference>(url);
      this.loaded.set(url, reference);
    }

    return await reference;
  }

  private urls(): Promise<Map<string, string>> {
    this.index ??= ServiceReferences.readIndex();

    return this.index;
  }
}

/**
 * The read handler of one Resource type, or undefined where the type has no
 * read handler or no resource type in its own service matches its name.
 *
 * The type's own service is the one whose Service Authorization Reference has a
 * resource type named after it (`AWS::CodeArtifact::Repository` and
 * `repository`). That is also the resource type each action is authorized on.
 */
async function readHandler(
  schema: RegistrySchema,
  references: ServiceReferences,
): Promise<ReadHandler | undefined> {
  const permissions = schema.handlers?.read?.permissions ?? [];
  const resourceName = normalized(schema.typeName.split("::").at(-1) ?? "");
  const prefixes = new Set(
    permissions.map((action) => action.split(":", 1)[0]?.toLowerCase() ?? ""),
  );

  for (const prefix of prefixes) {
    const reference = await references.get(prefix);
    const resource = reference?.Resources?.find((candidate) => {
      return normalized(candidate.Name) === resourceName;
    });

    if (reference !== undefined && resource !== undefined) {
      return ownServiceHandler(prefix, reference, resource, permissions);
    }
  }

  return undefined;
}

/**
 * The read handler's permissions in one service, sorted by whether each is
 * decided on the Resource itself or on no resource at all. A permission
 * decided on some other resource type is left out.
 */
function ownServiceHandler(
  prefix: string,
  reference: ServiceReference,
  resource: { readonly Name: string; readonly ARNFormats: readonly string[] },
  permissions: readonly string[],
): ReadHandler | undefined {
  const arn = resource.ARNFormats[0];
  const handler: ReadHandler = {
    arn: arn ?? "",
    actions: [],
    anyResourceActions: [],
  };

  for (const permission of permissions) {
    const [actionPrefix = "", actionName = ""] = permission.split(":", 2);
    const action = reference.Actions.find((candidate) => {
      return candidate.Name.toLowerCase() === actionName.toLowerCase();
    });
    const resources = action?.Resources ?? [];

    if (action === undefined || actionPrefix.toLowerCase() !== prefix) {
      continue;
    }

    if (resources.length === 0) {
      handler.anyResourceActions.push(`${prefix}:${action.Name}`);
    } else if (resources.some(({ Name }) => Name === resource.Name)) {
      handler.actions.push(`${prefix}:${action.Name}`);
    }
  }

  const found = handler.actions.length + handler.anyResourceActions.length;

  if (arn === undefined || found === 0) {
    return undefined;
  }

  return handler;
}

async function main(): Promise<void> {
  const schemas = await readSchemas();
  const references = new ServiceReferences();
  const types: Record<string, ReadHandler> = {};

  const sorted = schemas
    .filter(({ typeName }) => typeName.startsWith("AWS::"))
    .toSorted((left, right) => left.typeName.localeCompare(right.typeName));

  for (const schema of sorted) {
    const handler = await readHandler(schema, references);

    if (handler !== undefined) {
      types[schema.typeName] = handler;
    }
  }

  const snapshot = {
    readOn: new Date().toISOString().slice(0, 10),
    schemaRegion,
    types,
  };

  await writeFile(
    outputPath,
    `${JSON.stringify(snapshot, undefined, 2)}\n`,
    "utf8",
  );

  console.error(
    `Wrote ${String(Object.keys(types).length)} of ${String(sorted.length)} Resource types to ${path.relative(projectRoot, outputPath)}.`,
  );
}

await main();
