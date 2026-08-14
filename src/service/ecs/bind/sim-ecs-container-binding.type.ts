/**
 * What a bound container does when a task runs it.
 *
 * This is the shape of a job container: it does its work and returns, and the
 * task stops once it has. Returning is a clean exit, and throwing is a
 * non-zero one.
 */
export type SimEcsContainerRunHandler = () => void | Promise<void>;

/**
 * What a bound container does when an HTTP request reaches it.
 *
 * This is the shape of a service container behind a load balancer. It is
 * fetch-style, matching what a simulated AWS service controller already
 * answers a served request with, so a container and a Lambda function behind
 * the same listener answer in the same terms.
 *
 * The shape is settled here, but nothing runs it yet. Binding one is refused
 * rather than accepted and quietly never called.
 */
export type SimEcsContainerHttpHandler = (
  request: Request,
) => Response | Promise<Response>;

/**
 * Which container an executable binding targets.
 *
 * A binding names either the container directly, by the family that declares
 * it and its container name, or the image repository the container declares.
 * The repository form covers a container whose image tag changes with every
 * build, which is every container built by CDK or by a pipeline.
 */
export type SimEcsContainerBindingTarget =
  | {
      readonly family: string;
      readonly containerName: string;
      readonly imageRepository?: never;
    }
  | {
      readonly imageRepository: string;
      readonly family?: never;
      readonly containerName?: never;
    };

/**
 * What a bound container runs, which is one shape or the other.
 */
export type SimEcsContainerBindingHandler =
  | { readonly run: SimEcsContainerRunHandler; readonly http?: never }
  | { readonly http: SimEcsContainerHttpHandler; readonly run?: never };

/**
 * A real in-process handler bound to a container a task definition declares.
 *
 * Yulin never looks inside a container image, so a task can only run code the
 * test supplied. A binding is how that code is supplied, and what it is
 * matched on is either the container's name in its family or the repository
 * its image comes from.
 *
 * ```typescript
 * simAws.ecs().bindContainer({
 *   family: "orders-worker",
 *   containerName: "app",
 *   run: async () => {
 *     await processOutstandingOrders();
 *   },
 * });
 * ```
 */
export type SimEcsContainerBinding = SimEcsContainerBindingTarget &
  SimEcsContainerBindingHandler;
