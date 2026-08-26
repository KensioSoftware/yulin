import { assertDefined } from "../../../util/type-guard/defined.js";
import type { SimCfnServiceResourceFactory } from "../../cloudformation/resource/factory/sim-cfn-resource-factory.type.js";
import type {
  SimCfnResource,
  SimCloudFormationResourceCreateContext,
} from "../../cloudformation/resource/sim-cfn-resource.js";
import { SimGlueDatabase } from "../database/sim-glue-database.js";
import type { SimGlue } from "../sim-glue.js";
import { SimGlueTable } from "../table/sim-glue-table.js";
import { SimCfnGlueDatabaseCreator } from "./database/sim-cfn-glue-database-creator.js";
import { SimCfnGlueTableCreator } from "./table/sim-cfn-glue-table-creator.js";

interface SimGlueCfnResourceFactoryProperties {
  readonly glue: SimGlue;
  readonly catalogId: string;
}

/**
 * CloudFormation Resource factory for simulated Glue resources.
 *
 * A database and a table are the two Data Catalog types created from a
 * template here. A crawler is left out, since it fills a catalog by reading
 * objects and nothing here reads one. `AWS::Glue::Partition` is left out too,
 * and a template declaring either is recorded as a skipped Resource.
 */
export class SimGlueCfnResourceFactory implements SimCfnServiceResourceFactory {
  readonly #databaseCreator: SimCfnGlueDatabaseCreator;
  readonly #tableCreator: SimCfnGlueTableCreator;

  constructor(properties: SimGlueCfnResourceFactoryProperties) {
    this.#databaseCreator = new SimCfnGlueDatabaseCreator(properties);
    this.#tableCreator = new SimCfnGlueTableCreator(properties);
  }

  /**
   * Create a simulated Glue resource from a CloudFormation Resource.
   */
  create(
    resourceTypeName: string,
    resource: SimCfnResource,
    context: SimCloudFormationResourceCreateContext,
  ): Promise<object | undefined> {
    const properties = context.resolvedProperties ?? resource.properties;

    if (resourceTypeName === "Database") {
      return Promise.resolve(
        this.#databaseCreator.create(resource, properties),
      );
    }

    if (resourceTypeName === "Table") {
      return Promise.resolve(this.#tableCreator.create(resource, properties));
    }

    throw new Error(
      `Unsupported sim Glue CloudFormation Resource ${resourceTypeName}`,
    );
  }

  /**
   * Delete a simulated Glue resource created from a CloudFormation Resource.
   */
  delete(resourceTypeName: string, resource: SimCfnResource): Promise<void> {
    if (resourceTypeName === "Database") {
      this.#databaseCreator.delete(
        this.#simResource(resource, SimGlueDatabase, "database"),
      );

      return Promise.resolve();
    }

    if (resourceTypeName === "Table") {
      this.#tableCreator.delete(
        this.#simResource(resource, SimGlueTable, "table"),
      );

      return Promise.resolve();
    }

    throw new Error(
      `Unsupported sim Glue CloudFormation Resource ${resourceTypeName} ` +
        `deletion`,
    );
  }

  #simResource<T>(
    resource: SimCfnResource,
    kind: abstract new (...arguments_: never[]) => T,
    label: string,
  ): T {
    const simResource = resource.simResource;

    assertDefined(
      simResource instanceof kind ? simResource : undefined,
      `sim Glue ${label} for CloudFormation Resource ${resource.logicalId}`,
    );

    return simResource as T;
  }
}
