import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type {
  SimCfnTemplateValue,
  SimCfnTemplateValueRecord,
} from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimCreateNamedQueryCommandInput } from "../../command/named-query/named-query.command.js";
import { simCfnAthenaResourceError } from "../sim-cfn-athena-resource-error.js";
import { athenaNamedQueryResourceType } from "../sim-cfn-athena-resource-types.js";

/**
 * The AWS::Athena::NamedQuery properties simulated Athena reads.
 */
const readProperties = new Set([
  "Name",
  "Description",
  "Database",
  "QueryString",
  "WorkGroup",
]);

/**
 * Reads AWS::Athena::NamedQuery properties into the shape CreateNamedQuery
 * takes.
 *
 * The resource is four fields and a workgroup, and all five line up with the
 * API. Anything else a template puts on one is recorded as ignored rather than
 * refused.
 */
export class SimCfnAthenaNamedQueryProperties {
  private readonly resource: SimCfnResource;
  private readonly properties: ReadonlyMap<string, SimCfnTemplateValue>;

  constructor(properties: {
    readonly resource: SimCfnResource;
    readonly properties: SimCfnTemplateValueRecord;
  }) {
    this.resource = properties.resource;
    this.properties = new Map(Object.entries(properties.properties));
  }

  /**
   * Everything CreateNamedQuery takes, read out of the template.
   *
   * A named query with no `Name` keeps none. Real CloudFormation generates one
   * as it does for a workgroup, and simulated Athena refuses a nameless named
   * query, so the refusal is what a template missing it gets.
   */
  createInput(): SimCreateNamedQueryCommandInput {
    return {
      Name: this.stringProperty("Name"),
      Description: this.stringProperty("Description"),
      Database: this.stringProperty("Database"),
      QueryString: this.stringProperty("QueryString"),
      WorkGroup: this.stringProperty("WorkGroup"),
    };
  }

  /**
   * Record the properties the named query is created without acting on.
   */
  recordIgnoredProperties(): void {
    for (const name of this.properties.keys()) {
      if (readProperties.has(name)) {
        continue;
      }

      this.resource.ignoreProperty(
        name,
        `${name} is not a property simulated Athena knows about, so the ` +
          `named query is created without it`,
      );
    }
  }

  private stringProperty(name: string): string | undefined {
    const value = this.properties.get(name);

    if (value === undefined) {
      return undefined;
    }

    if (typeof value !== "string") {
      throw simCfnAthenaResourceError(
        athenaNamedQueryResourceType,
        this.resource.logicalId,
        `${name} must be a string`,
      );
    }

    return value;
  }
}
