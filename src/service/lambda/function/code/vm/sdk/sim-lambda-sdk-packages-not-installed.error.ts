/**
 * AWS SDK packages the sim Lambda runtime was asked to provide and the
 * consuming project has not installed.
 *
 * The real Lambda runtime provides these packages from the execution
 * environment rather than from the deployment package, so the simulated
 * runtime provides them from the host project. The fix is the same for every
 * one of them, which is why they are named together: install them, or bundle
 * them into the function code archive.
 */
export class SimLambdaSdkPackagesNotInstalledError extends Error {
  public override readonly name = "SimLambdaSdkPackagesNotInstalledError";

  constructor(
    readonly specifiers: readonly string[],
    options?: ErrorOptions,
  ) {
    super(notInstalledMessage(specifiers), options);
  }
}

function notInstalledMessage(specifiers: readonly string[]): string {
  const [subject, object] =
    specifiers.length > 1
      ? ["the packages are", "them"]
      : ["the package is", "it"];
  return (
    `Cannot provide ${specifiers.join(", ")} to sim Lambda function code: ` +
    `${subject} not installed. Install ${object} in your project, as the ` +
    `real Lambda runtime provides ${object}, or bundle ${object} into the ` +
    "function code archive."
  );
}
