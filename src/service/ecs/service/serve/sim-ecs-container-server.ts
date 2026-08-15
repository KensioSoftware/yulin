import type { SimAwsRunAsOwner } from "../../../aws/caller/sim-aws-run-as-context.js";
import { simAwsRunAsContext } from "../../../aws/caller/sim-aws-run-as-context.js";
import type { SimEcsContainerHttpHandler } from "../../bind/sim-ecs-container-binding.type.js";
import type { SimEcsContainerDefinition } from "../../task-definition/container/sim-ecs-container-definition.js";
import type { SimEcsContainerEnvironment } from "../../task/run/sim-ecs-container-environment.js";
import { simEcsTaskPrincipal } from "../../task/run/sim-ecs-task-principal.js";

interface SimEcsContainerServerProperties {
  readonly declared: SimEcsContainerDefinition;
  readonly handler: SimEcsContainerHttpHandler;
  readonly environment: SimEcsContainerEnvironment;
  readonly taskRoleArn: string | undefined;
  readonly runAsOwner: SimAwsRunAsOwner;
}

/**
 * One container of a running service, answering the requests routed to it.
 *
 * The handler is called once per request rather than once per task, which
 * follows the decision a service's desired count already rests on: the count is
 * state rather than concurrency, so there are no copies of the container to
 * share requests between.
 *
 * A request is answered as the task Role, with the container's environment
 * applied, exactly as a container consuming a queue handles a batch and as a
 * container of a run task runs its handler. That is what makes a service
 * container's AWS calls authorized the way the deployed one's would be, rather
 * than as whoever sent the request.
 */
export class SimEcsContainerServer {
  public readonly containerName: string;

  private readonly declared: SimEcsContainerDefinition;
  private readonly handler: SimEcsContainerHttpHandler;
  private readonly environment: SimEcsContainerEnvironment;
  private readonly taskRoleArn: string | undefined;
  private readonly runAsOwner: SimAwsRunAsOwner;

  constructor(properties: SimEcsContainerServerProperties) {
    this.declared = properties.declared;
    this.containerName = properties.declared.name;
    this.handler = properties.handler;
    this.environment = properties.environment;
    this.taskRoleArn = properties.taskRoleArn;
    this.runAsOwner = properties.runAsOwner;
  }

  /**
   * Whether this container declared it listens on a port.
   *
   * That is what tells two bound containers of the same task apart when a load
   * balancer registration names a port rather than one of them.
   */
  listensOn(port: number): boolean {
    return this.declared.containerPorts.includes(port);
  }

  /**
   * Answer one request with this container's handler.
   *
   * Whatever the handler throws is left to the load balancer, which is what
   * turns it into the status a real one sends when a target fails.
   */
  async handle(request: Request): Promise<Response> {
    return await simAwsRunAsContext.run(
      this.runAsOwner,
      simEcsTaskPrincipal(this.taskRoleArn),
      async () =>
        await this.environment.runWith(async () => await this.handler(request)),
    );
  }
}
