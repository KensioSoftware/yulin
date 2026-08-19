/** The characters CloudFormation documents a referenced parameter name as. */
const ssmReferenceName = /^[a-zA-Z0-9_.\-/]+$/;

/** The version selector, which CloudFormation documents as an integer. */
const ssmReferenceVersion = /^\d+$/;

/** A reference body read as the parameter name and the version after it. */
export interface SimCfnSsmReferenceBody {
  readonly name: string;
  readonly version: string | undefined;
}

/**
 * Read a reference body as a parameter name and an optional version.
 *
 * A parameter name holds no colon, so the last one always opens the version.
 * `ssm` and `ssm-secure` references take the same body, and read it the same
 * way.
 */
export function parseSimCfnSsmReferenceBody(
  body: string,
): SimCfnSsmReferenceBody | undefined {
  const colon = body.lastIndexOf(":");

  if (colon === -1) {
    return ssmReferenceName.test(body)
      ? { name: body, version: undefined }
      : undefined;
  }

  const name = body.slice(0, colon);
  const version = body.slice(colon + 1);

  if (!ssmReferenceName.test(name) || !ssmReferenceVersion.test(version)) {
    return undefined;
  }

  return { name, version };
}
