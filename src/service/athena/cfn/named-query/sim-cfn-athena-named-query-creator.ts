import { assertDefined } from "../../../../util/type-guard/defined.js";
import type { SimCfnResource } from "../../../cloudformation/resource/sim-cfn-resource.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import type { SimAthenaNamedQuery } from "../../named-query/sim-athena-named-query.js";
import type { SimAthena } from "../../sim-athena.js";
import { simCfnAthenaResourceCreation } from "../sim-cfn-athena-resource-error.js";
import { athenaNamedQueryResourceType } from "../sim-cfn-athena-resource-types.js";
import { SimCfnAthenaNamedQueryProperties } from "./sim-cfn-athena-named-query-properties.js";
import type { SimCfnResourceCallerOptions } from "../../../cloudformation/resource/caller/sim-cfn-resource-caller-options.js";

interface SimCfnAthenaNamedQueryCreatorProperties {
  readonly athena: SimAthena;
}

/**
 * Creates and deletes a simulated named query for one AWS::Athena::NamedQuery
 * Resource.
 *
 * The named query goes through the ordinary CreateNamedQuery command, so a
 * template naming a workgroup that is absent is refused here exactly as an SDK
 * caller would be. That refusal fails the Resource, because a stack whose
 * console queries silently went nowhere is worse than one that says so.
 */
export class SimCfnAthenaNamedQueryCreator {
  private readonly athena: SimAthena;

  constructor(properties: SimCfnAthenaNamedQueryCreatorProperties) {
    this.athena = properties.athena;
  }

  /**
   * Create the named query a Resource declares.
   */
  async create(
    resource: SimCfnResource,
    properties: SimCfnTemplateValueRecord,
    options?: SimCfnResourceCallerOptions,
  ): Promise<SimAthenaNamedQuery> {
    const read = new SimCfnAthenaNamedQueryProperties({
      resource,
      properties,
    });
    read.recordIgnoredProperties();

    const input = read.createInput();

    return await simCfnAthenaResourceCreation(
      athenaNamedQueryResourceType,
      resource.logicalId,
      async () => {
        const created = await this.athena.createNamedQuery({ input }, options);
        const namedQuery = this.athena
          .namedQueries()
          .find((candidate) => candidate.namedQueryId === created.NamedQueryId);

        assertDefined(
          namedQuery,
          `sim Athena named query ${String(input.Name)} after ` +
            `CloudFormation creation`,
        );

        return namedQuery;
      },
    );
  }

  /**
   * Delete the named query a Resource created.
   */
  async delete(
    namedQuery: SimAthenaNamedQuery,
    options?: SimCfnResourceCallerOptions,
  ): Promise<void> {
    await this.athena.deleteNamedQuery(
      { input: { NamedQueryId: namedQuery.namedQueryId } },
      options,
    );
  }
}
