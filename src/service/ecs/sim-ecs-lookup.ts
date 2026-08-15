import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simEcsDefaultClusterName } from "./cluster/sim-ecs-cluster-arn.js";
import type { SimEcsCluster } from "./cluster/sim-ecs-cluster.js";
import type { SimEcsClusterStore } from "./cluster/sim-ecs-cluster-store.js";
import {
  SimEcsClusterNotFoundException,
  SimEcsServiceNotFoundException,
} from "./error/sim-ecs.error.js";
import type { SimEcsServiceArn } from "./service/sim-ecs-service-arn.js";
import type { SimEcsServiceStore } from "./service/sim-ecs-service-store.js";
import type { SimEcsService } from "./service/sim-ecs-service.js";
import { SimEcsTaskDefinitionId } from "./task-definition/sim-ecs-task-definition-id.js";
import type { SimEcsTaskDefinitionStore } from "./task-definition/sim-ecs-task-definition-store.js";
import type { SimEcsTaskDefinition } from "./task-definition/sim-ecs-task-definition.js";

interface SimEcsLookupProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly clusters: SimEcsClusterStore;
  readonly taskDefinitions: SimEcsTaskDefinitionStore;
  readonly services: SimEcsServiceStore;
  readonly serviceArn: SimEcsServiceArn;
}

/**
 * What reads simulated ECS state without being an operation.
 *
 * A command handler answers with a description, which is what an SDK caller
 * gets. A CloudFormation Resource needs the thing itself, so it can be what
 * the Stack holds and what `Ref` and `Fn::GetAtt` answer from, and a test
 * asserting on state wants the same. Both go through here rather than through
 * the stores, so the way a name is read stays the way the commands read one.
 */
export class SimEcsLookup {
  private readonly accountRegionScope: SimAwsAccountRegionScope;
  private readonly clusters: SimEcsClusterStore;
  private readonly taskDefinitions: SimEcsTaskDefinitionStore;
  private readonly services: SimEcsServiceStore;
  private readonly serviceArn: SimEcsServiceArn;

  constructor(properties: SimEcsLookupProperties) {
    this.accountRegionScope = properties.accountRegionScope;
    this.clusters = properties.clusters;
    this.taskDefinitions = properties.taskDefinitions;
    this.services = properties.services;
    this.serviceArn = properties.serviceArn;
  }

  /**
   * The cluster of this name, active or deleted.
   *
   * A name nothing holds is refused, since the caller asked for a cluster
   * rather than for whether there is one.
   */
  cluster(clusterName: string): SimEcsCluster {
    const cluster = this.clusters.find(clusterName);

    if (cluster === undefined) {
      throw new SimEcsClusterNotFoundException(
        `The simulated Account and Region hold no cluster ${clusterName}.`,
      );
    }

    return cluster;
  }

  /**
   * The service a name or a full ARN names, active or deleted.
   *
   * A service belongs to a cluster, so a name on its own is looked for in the
   * cluster given alongside it, and in the `default` one when none is. An ARN
   * carries its own cluster and is looked for there, whatever else was given.
   */
  service(
    identifier: string,
    clusterName: string = simEcsDefaultClusterName,
  ): SimEcsService {
    const named = this.serviceArn.namedService(identifier);

    if (named === undefined) {
      throw new SimEcsServiceNotFoundException(
        `${identifier} names no service in this simulated Account and Region.`,
      );
    }

    const inCluster = named.clusterName ?? clusterName;
    const service = this.services.find(inCluster, named.serviceName);

    if (service === undefined) {
      throw new SimEcsServiceNotFoundException(
        `The cluster ${inCluster} holds no service ${named.serviceName}.`,
      );
    }

    return service;
  }

  /**
   * The task definition revision a family, `family:revision` or ARN names.
   */
  taskDefinition(identifier: string): SimEcsTaskDefinition {
    return this.taskDefinitions.resolve(
      SimEcsTaskDefinitionId.parse(identifier, this.accountRegionScope),
    );
  }
}
