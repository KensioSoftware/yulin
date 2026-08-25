import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import type { SimAthenaQueryExecutionStore } from "../execution/sim-athena-query-execution-store.js";
import type { SimAthenaQueryRunner } from "../execution/sim-athena-query-runner.js";
import { SimAthenaQueryTokens } from "../execution/sim-athena-query-tokens.js";
import type { SimAthenaNamedQueryStore } from "../named-query/sim-athena-named-query-store.js";
import type { SimAthenaWorkGroupStore } from "../workgroup/sim-athena-work-group-store.js";
import { SimAthenaAuthorizer } from "./authorize/sim-athena-authorizer.js";
import { SimAthenaExecutionReads } from "./execution/sim-athena-execution-reads.js";
import { SimAthenaExecutionWrites } from "./execution/sim-athena-execution-writes.js";
import { SimAthenaNamedQueryReads } from "./named-query/sim-athena-named-query-reads.js";
import { SimAthenaNamedQueryWrites } from "./named-query/sim-athena-named-query-writes.js";
import { SimAthenaWorkGroupReads } from "./work-group/sim-athena-work-group-reads.js";
import { SimAthenaWorkGroupWrites } from "./work-group/sim-athena-work-group-writes.js";

interface SimAthenaCommandsProperties {
  readonly workGroups: SimAthenaWorkGroupStore;
  readonly namedQueries: SimAthenaNamedQueryStore;
  readonly executions: SimAthenaQueryExecutionStore;
  readonly runner: SimAthenaQueryRunner;
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clock: SimClock;
}

/**
 * Every command handler one simulated Athena scope delegates to.
 *
 * The wiring lives here rather than in the facade so that `SimAthena` stays
 * what it is meant to be: state and delegation. Reads are held apart from
 * writes for each resource, because the two have different collaborators: a
 * write needs the clock and the rules about what may change, and a read needs
 * the shape a response comes back in.
 */
export class SimAthenaCommands {
  public readonly workGroupReads: SimAthenaWorkGroupReads;
  public readonly workGroupWrites: SimAthenaWorkGroupWrites;
  public readonly namedQueryReads: SimAthenaNamedQueryReads;
  public readonly namedQueryWrites: SimAthenaNamedQueryWrites;
  public readonly executionReads: SimAthenaExecutionReads;
  public readonly executionWrites: SimAthenaExecutionWrites;

  constructor(properties: SimAthenaCommandsProperties) {
    const { workGroups, namedQueries } = properties;
    const authorizer = new SimAthenaAuthorizer({
      iam: properties.iam,
      accountRegionScope: properties.accountRegionScope,
    });

    this.workGroupReads = new SimAthenaWorkGroupReads({
      workGroups,
      authorizer,
    });
    this.workGroupWrites = new SimAthenaWorkGroupWrites({
      workGroups,
      namedQueries,
      authorizer,
      clock: properties.clock,
    });
    this.namedQueryReads = new SimAthenaNamedQueryReads({
      namedQueries,
      workGroups,
      authorizer,
    });
    this.namedQueryWrites = new SimAthenaNamedQueryWrites({
      namedQueries,
      workGroups,
      authorizer,
    });
    this.executionReads = new SimAthenaExecutionReads({
      executions: properties.executions,
      authorizer,
    });
    this.executionWrites = new SimAthenaExecutionWrites({
      executions: properties.executions,
      workGroups,
      runner: properties.runner,
      tokens: new SimAthenaQueryTokens(),
      authorizer,
      clock: properties.clock,
    });
  }
}
