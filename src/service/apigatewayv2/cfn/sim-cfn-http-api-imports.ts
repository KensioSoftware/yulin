import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";

/**
 * The APIs a template declared as an OpenAPI document.
 *
 * An `AWS::ApiGatewayV2::Api` carrying a `Body` creates its own routes,
 * integrations and authorizers, so a sibling Resource creating another one on
 * the same API is a template written two ways at once. Which of the two AWS
 * would keep is not established, and the answer decides what every request to
 * that route reaches, so the stack fails naming both Resources rather than
 * deploying whichever happened to be created last.
 *
 * The mapping is kept here rather than on the simulated API, because being
 * declared by an import is a fact about the template rather than about the
 * API: an SDK caller can call `CreateRoute` on an imported API freely, as they
 * can on AWS.
 */
export class SimCfnHttpApiImports {
  private readonly importedBy = new Map<string, string>();

  /**
   * Remember that a Resource declared an API as a document.
   */
  record(apiId: string, logicalId: string): void {
    this.importedBy.set(apiId, logicalId);
  }

  /**
   * Refuse a Resource adding to an API a document already declared.
   */
  requireNotImported(
    resourceType: string,
    resource: SimCfnResource,
    apiId: string,
  ): void {
    const importedBy = this.importedBy.get(apiId);

    if (importedBy === undefined) {
      return;
    }

    throw new Error(
      `${resourceType} ${resource.logicalId} cannot be deployed: API ` +
        `${apiId} is declared as an OpenAPI document by ${importedBy}, which ` +
        `creates the API's own routes, integrations and authorizers. Declare ` +
        `this one in that document, or drop the Body property and declare ` +
        `the API's parts as Resources.`,
    );
  }
}
