/**
 * `import cf from "cloudfront"`, in the forms the runtime accepts it.
 *
 * The binding name is captured because a Function may call it something other
 * than `cf`, and the quoting and the semicolon are both optional.
 */
const cloudFrontImport =
  /^[\t ]*import[\t ]+(?<binding>[A-Za-z_$][\w$]*)[\t ]+from[\t ]+["']cloudfront["'][\t ]*;?[\t ]*$/gmu;

/**
 * Rewrite the `cloudfront` import out of CloudFront Function source.
 *
 * JS 2.0 has no module system to speak of, but it does let a Function reach the
 * `cf` helpers with this one import. Source runs here in a `vm.Script`, which
 * is not a module and treats any import statement as a syntax error, so the
 * import is turned into a binding to the `cf` the sandbox already holds.
 *
 * The line is replaced rather than removed so that line numbers in a stack
 * trace still line up with the source the caller wrote.
 *
 * The binding reads `globalThis.cf` rather than the bare `cf` the sandbox
 * holds, because the usual binding name is `cf` and `const cf = cf` would be a
 * reference to a name in its own initializer.
 *
 * Any other import is left alone: it is not something the runtime would run
 * either, and leaving it in means the syntax error names the line the Function
 * actually got wrong.
 */
export function cffSourceWithoutCloudFrontImport(source: string): string {
  return source.replaceAll(
    cloudFrontImport,
    (_match, binding: string) => `const ${binding} = globalThis.cf;`,
  );
}
