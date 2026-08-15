/**
 * The real AWS::ECS::Service properties this simulation has nothing to act on,
 * and why.
 *
 * `CreateService` refuses all of them, because a setting it does not hold would
 * go missing from the service it made. A template carrying one is deployed
 * without it all the same: a stack that will not deploy is worth less to a test
 * than a service running the task definition the stack declared.
 *
 * They are a list on their own because they are a list and nothing else. What
 * reads them is next door, and a property added here changes what a deployment
 * reports without changing anything that runs.
 */
export const simCfnEcsServiceUnsimulatedReasons: ReadonlyMap<string, string> =
  new Map([
    [
      "NetworkConfiguration",
      "there is no network here, so a subnet, a security group and a public " +
        "IP reach nothing",
    ],
    [
      "CapacityProviderStrategy",
      "a simulated task runs in this process rather than on capacity, so " +
        "there is nothing for a capacity provider to place it on",
    ],
    [
      "DeploymentConfiguration",
      "a service's tasks come up all at once and are replaced all at once, so " +
        "there is no rollout for a percentage or a circuit breaker to govern",
    ],
    [
      "DeploymentController",
      "there are no deployments here to be controlled by ECS, CodeDeploy or " +
        "an external controller",
    ],
    [
      "ServiceRegistries",
      "service discovery is not simulated, so nothing resolves a service by " +
        "name",
    ],
    [
      "ServiceConnectConfiguration",
      "service discovery is not simulated, so nothing resolves a service by " +
        "name",
    ],
    [
      "PlatformVersion",
      "there is no Fargate platform here to run one version of",
    ],
    [
      "HealthCheckGracePeriodSeconds",
      "nothing checks the health of a simulated task, so there is no grace " +
        "period to hold one through",
    ],
    [
      "PlacementConstraints",
      "there are no container instances here for a task to be placed on",
    ],
    [
      "PlacementStrategies",
      "there are no container instances here to spread or pack tasks across",
    ],
    [
      "AvailabilityZoneRebalancing",
      "there are no Availability Zones here for tasks to be moved between",
    ],
    [
      "Role",
      "the service role is what registers tasks with a classic load balancer, " +
        "and nothing here registers anything",
    ],
    [
      "EnableExecuteCommand",
      "there is no container process here to open a session into",
    ],
    [
      "EnableECSManagedTags",
      "a simulated service holds no tags for ECS to manage",
    ],
    ["PropagateTags", "a simulated service and its tasks hold no tags"],
    ["Tags", "a simulated service holds no tags"],
    [
      "VolumeConfigurations",
      "there is no volume to attach, since a container is an in-process handler",
    ],
    [
      "VpcLatticeConfigurations",
      "there is no VPC here for a Lattice target group to reach a task through",
    ],
  ]);
