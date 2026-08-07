/**
 * Resource types sim CloudFormation deliberately creates nothing for, with what
 * each of them would have changed if it had.
 *
 * Not the same list as the Resource types nothing simulates. Those are skipped,
 * and a skip is a gap: it means a test written against that Resource is going
 * to find it missing. An entry here is a Resource this simulator could be given
 * an implementation for and would run no differently with one, so reporting it
 * as a gap sends a reader looking for something that is not lost.
 *
 * The bar is the one each service applies to its own properties: nothing this
 * simulator models can tell the difference. Unlike an inert property, an inert
 * Resource is still recorded, and read back from `stack.inertResources`. A
 * property is one line of a Resource that exists either way, where a whole
 * Resource going missing is startling enough that a reader deserves to be able
 * to find out why, and the reason says what it would take for the difference to
 * start mattering.
 */
export const simCfnInertResourceTypes: ReadonlyMap<string, string> = new Map([
  [
    "AWS::CDK::Metadata",
    "the construct-library analytics CDK adds to every synthesized Stack, " +
      "which no other Resource names and no command reads",
  ],
  [
    "AWS::Lambda::LayerVersion",
    "sim Lambda runs a function's own code archive, or a real in-process " +
      "handler bound to it, so nothing a Layer carries is ever on a simulated " +
      "function's module path",
  ],
]);
