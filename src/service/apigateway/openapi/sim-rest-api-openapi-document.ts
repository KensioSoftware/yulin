import { simRestApiOpenApiRoot } from "./sim-rest-api-openapi-body.js";
import { simRestApiOpenApiRefusedRootMembers } from "./sim-rest-api-openapi-root-members.js";
import type { SimRestApiOpenApiObject } from "./sim-rest-api-openapi-object.js";
import { SimRestApiOpenApiPaths } from "./sim-rest-api-openapi-paths.js";

/**
 * The OpenAPI versions a REST API is imported from.
 *
 * 3.1 is a separate specification rather than a later revision of 3.0, and
 * Swagger 2 predates both, so each is refused by version rather than read as
 * far as it happens to agree.
 */
const simulatedVersion = /^3\.0\.\d+$/;

/**
 * The OpenAPI 3.0 document a REST API is imported from.
 *
 * This is the root of the document and the version check on it. Everything
 * below is read by a class named after the member it reads, because the
 * refusal surface is most of the work and one reader would not stay readable.
 */
export class SimRestApiOpenApiDocument {
  private readonly root: SimRestApiOpenApiObject;

  constructor(root: SimRestApiOpenApiObject) {
    this.root = root;

    this.requireSimulatedVersion();
    this.refuseUnsimulatedMembers();
  }

  /**
   * Read a serialised OpenAPI document.
   */
  static parse(body: string): SimRestApiOpenApiDocument {
    return new SimRestApiOpenApiDocument(simRestApiOpenApiRoot(body));
  }

  /**
   * The name the imported API takes, which is the document's own title.
   */
  title(): string {
    return this.root.member("info").object().member("title").requiredString();
  }

  /**
   * The paths this document declares, one resource and one method per
   * operation under each.
   */
  paths(): SimRestApiOpenApiPaths {
    return new SimRestApiOpenApiPaths(this.root.member("paths"));
  }

  /**
   * Refuse a document this simulation would read as something it is not.
   */
  private requireSimulatedVersion(): void {
    this.root.refuseMember(
      "swagger",
      "a Swagger 2 document is not simulated. Only OpenAPI 3.0.x is read.",
    );

    const declared = this.root.member("openapi");
    const version = declared.requiredString();

    if (!simulatedVersion.test(version)) {
      throw declared.refusal(
        `is '${version}', and only OpenAPI 3.0.x is simulated`,
      );
    }
  }

  /**
   * Refuse the root members that would otherwise be dropped.
   */
  private refuseUnsimulatedMembers(): void {
    for (const [name, reason] of simRestApiOpenApiRefusedRootMembers) {
      this.root.refuseMember(name, reason);
    }
  }
}
