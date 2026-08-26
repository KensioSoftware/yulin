/**
 * One JSON document read out of text, or nothing where the text is no JSON.
 *
 * Trino fails a query over text that is no JSON and this answers null, which is
 * the same forgiving direction the rest of the engine takes. The Athena docs
 * page names it.
 */
export function simAthenaJsonDocument(text: string | undefined): unknown {
  if (text === undefined) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * The value one `$.a.b` path reaches, or nothing where it reaches none.
 *
 * The path syntax read here is the dotted one Athena's own examples use, with
 * a bracketed index into an array alongside it, as `$.tags[0]`. A filter
 * expression falls outside it.
 */
export function simAthenaJsonAt(
  json: string | undefined,
  path: string | undefined,
): unknown {
  if (path === undefined) {
    return undefined;
  }

  const keys = path.replace(/^\$\.?/u, "").match(/[^.[\]]+/gu) ?? [];
  let current = simAthenaJsonDocument(json);

  for (const key of keys) {
    current = simAthenaJsonProperty(current, key);
  }

  return current;
}

/**
 * One property of a JSON object, or one element of an array.
 *
 * An array carries its indexes as its own properties, so reading one by name
 * is the same read either way. A JSON path counts an array from zero, unlike
 * every Trino function that takes an index.
 */
export function simAthenaJsonProperty(value: unknown, key: string): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    !Object.hasOwn(value, key)
  ) {
    return undefined;
  }

  // The key comes out of the query's own JSON path, which is what this reads.
  // oxlint-disable-next-line security/detect-object-injection
  return (value as Record<string, unknown>)[key];
}
