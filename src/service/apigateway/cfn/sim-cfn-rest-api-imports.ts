import type { SimCfnResource } from "../../cloudformation/resource/sim-cfn-resource.js";

/**
 * The APIs a template declared as an OpenAPI document.
 *
 * An `AWS::ApiGateway::RestApi` carrying a `Body` creates its own resources,
 * methods and integrations, so a sibling Resource creating another one on the
 * same API is a template written two ways at once. Which of the two AWS would
 * keep is not established, and the answer decides what every request to that
 * path reaches, so the stack fails naming both Resources rather than deploying
 * whichever happened to be created last.
 *
 * The mapping is kept here rather than on the simulated API, because being
 * declared by an import is a fact about the template rather than about the
 * API: an SDK caller can call `CreateResource` on an imported API freely, as
 * they can on AWS.
 */
export class SimCfnRestApiImports {
  private readonly importedBy = new Map<string, string>();

  /**
   * Remember that a Resource declared an API as a document.
   */
  record(restApiId: string, logicalId: string): void {
    this.importedBy.set(restApiId, logicalId);
  }

  /**
   * Refuse a Resource adding to an API a document already declared.
   */
  requireNotImported(
    resourceType: string,
    resource: SimCfnResource,
    restApiId: string,
  ): void {
    const importedBy = this.importedBy.get(restApiId);

    if (importedBy === undefined) {
      return;
    }

    throw new Error(
      `${resourceType} ${resource.logicalId} cannot be deployed: REST API ` +
        `${restApiId} is declared as an OpenAPI document by ${importedBy}, ` +
        `which creates the API's own resources, methods and integrations. ` +
        `Declare this one in that document, or drop the Body property and ` +
        `declare the API's parts as Resources.`,
    );
  }
}
