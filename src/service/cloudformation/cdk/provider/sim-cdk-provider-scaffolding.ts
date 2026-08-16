import type { SimCfnResource } from "../../resource/sim-cfn-resource.js";
import { simCdkCustomResourceFactories } from "../../resource/resolve/service/sim-cfn-custom-resource-factories.js";
import { parseSimCfnNode } from "../../template/parse/node/sim-cfn-node-parser.js";

const customResourceTypePrefix = "Custom::";
const lambdaFunctionResourceType = "AWS::Lambda::Function";

/**
 * The Resources in a Stack that exist only to run a CDK custom Resource sim
 * CloudFormation carries out itself.
 *
 * CDK reaches a feature it has no CloudFormation Resource type for by writing a
 * `Custom::` Resource and a Lambda function to answer it. Where this simulator
 * creates that custom Resource directly, as it does for `BucketDeployment` and
 * Bucket notifications, the function is left holding nothing: it is never
 * invoked and its code is never loaded. The work is already done by the time
 * anything would have called it.
 *
 * Only the function is recognised here. A newer CDK writes the provider's log
 * group into the template too, and simulated CloudWatch Logs creates that like
 * any other log group: an empty log group is exactly what an account is left
 * with when nothing invokes the function, so creating it says more than
 * reporting it as deliberately left out ever did.
 *
 * That makes the function and its log group Resources no test can tell apart
 * from ones that were created, which is the same reason a Resource type nothing
 * simulates has for being reported as a skip, arrived at from the opposite
 * direction. Reporting them as skips is worse than saying nothing: CDK's
 * provider is a Python function, so the skip reads "bind a real in-process
 * handler to this function to simulate it", which is advice that would replace
 * a working simulation with a hand-written one.
 *
 * The recognition is by association rather than by name. CDK's logical IDs are
 * generated from construct paths and a hash, and are not an interface anything
 * should match on; the link from a custom Resource to its provider through
 * `ServiceToken` is one CloudFormation itself relies on.
 */
export class SimCdkProviderScaffolding {
  readonly #resources: ReadonlyMap<string, SimCfnResource>;
  readonly #providerFunctions: ReadonlyMap<string, string>;

  constructor(resources: ReadonlyMap<string, SimCfnResource>) {
    this.#resources = resources;
    this.#providerFunctions = this.findProviderFunctions();
  }

  /**
   * Why this Resource is scaffolding for a custom Resource this simulator has
   * already carried out, or undefined when it is not.
   */
  reasonFor(resource: SimCfnResource): string | undefined {
    return this.providerFunctionReason(resource);
  }

  /**
   * The Resource is the provider function itself.
   */
  private providerFunctionReason(resource: SimCfnResource): string | undefined {
    const customResourceType = this.#providerFunctions.get(resource.logicalId);

    if (customResourceType === undefined) {
      return undefined;
    }

    return (
      `sim CloudFormation carries out ${customResourceType} itself, so CDK's ` +
      `provider function for it is never invoked`
    );
  }

  /**
   * Each provider function in this Stack, against the custom Resource type it
   * answers for.
   *
   * A `Custom::` Resource names its provider in `ServiceToken`, usually as an
   * `Fn::GetAtt` for the function's ARN. Reading it through the ordinary node
   * parser takes every form CloudFormation accepts, and keeping only names that
   * are Lambda functions in this Stack leaves out a `ServiceToken` pointing at
   * a function deployed somewhere else, which is not this Stack's to reason
   * about.
   *
   * One provider answers every custom Resource of its type in a Stack, since
   * CDK builds it as a singleton, so the first type to claim a function is the
   * one reported against it.
   */
  private findProviderFunctions(): ReadonlyMap<string, string> {
    const found = new Map<string, string>();

    for (const resource of this.#resources.values()) {
      const customResourceType = simulatedCustomResourceType(resource);

      if (customResourceType === undefined) {
        continue;
      }

      for (const logicalId of this.functionsNamedBy(resource)) {
        if (!found.has(logicalId)) {
          found.set(logicalId, customResourceType);
        }
      }
    }

    return found;
  }

  private functionsNamedBy(customResource: SimCfnResource): string[] {
    const serviceToken = customResource.properties["ServiceToken"];

    if (serviceToken === undefined) {
      return [];
    }

    return parseSimCfnNode(serviceToken)
      .referencedNames()
      .filter((logicalId) => {
        return (
          this.#resources.get(logicalId)?.type === lambdaFunctionResourceType
        );
      });
  }
}

/**
 * The custom Resource type this Resource is, when it is one this simulator
 * creates itself rather than by running a provider.
 */
function simulatedCustomResourceType(
  resource: SimCfnResource,
): string | undefined {
  const { type } = resource;

  if (type === undefined || !type.startsWith(customResourceTypePrefix)) {
    return undefined;
  }

  const resourceTypeName = type.slice(customResourceTypePrefix.length);

  return simCdkCustomResourceFactories.has(resourceTypeName) ? type : undefined;
}
