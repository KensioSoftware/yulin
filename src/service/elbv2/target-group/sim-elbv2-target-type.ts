import {
  SimElbV2InvalidConfigurationRequestException,
  SimElbV2InvalidTargetException,
  SimElbV2UnsimulatedInputException,
} from "../error/sim-elbv2.error.js";

/**
 * What a target group holds, and the rules that follow from it.
 *
 * A target type is a strategy rather than a label: the number of targets a
 * group takes, what a target's Id has to look like, and whether the group
 * itself carries a protocol and port all depend on it, and each subclass here
 * is one set of those answers.
 *
 * Two types are simulated. `lambda` is what real ALB invokes directly, and
 * `ip` is what a service registers itself as. `instance` is refused rather
 * than accepted, because there are no EC2 instances here for it to mean
 * anything about: a group created as `instance` would look configured and
 * route nowhere.
 */
export abstract class SimElbV2TargetType {
  /**
   * The value this type is named by, in a request and in a describe.
   */
  abstract readonly value: string;

  /**
   * The most targets real ELB lets a group of this type hold.
   */
  abstract readonly maximumTargets: number;

  /**
   * Refuse a target group whose other properties contradict this type.
   */
  abstract validateGroup(properties: SimElbV2TargetGroupShape): void;

  /**
   * Refuse a target this type would not take.
   */
  abstract validateTarget(target: SimElbV2TargetShape): void;
}

/**
 * The target group properties a target type has an opinion about.
 */
export interface SimElbV2TargetGroupShape {
  readonly protocol: string | undefined;
  readonly port: number | undefined;
}

/**
 * The registered target properties a target type has an opinion about.
 */
export interface SimElbV2TargetShape {
  readonly id: string;
  readonly port: number | undefined;
}

/**
 * A function ARN, which is the only Id a `lambda` target takes.
 */
const functionArn = /^arn:aws:lambda:[\da-z-]+:\d{12}:function:[\w-]+$/u;

/**
 * An IPv4 address.
 */
const ipv4Address = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u;

/**
 * An IPv6 address, recognised by the characters it is made of and the colons
 * in it rather than parsed in full, since nothing here does anything with the
 * address beyond storing it.
 */
const ipv6Characters = /^[\dA-Fa-f:]+$/u;

/**
 * Whether a target Id is an address of either family.
 */
function isIpAddress(id: string): boolean {
  return ipv4Address.test(id) || (id.includes(":") && ipv6Characters.test(id));
}

/**
 * A target group holding one Lambda function.
 */
class SimElbV2LambdaTargetType extends SimElbV2TargetType {
  public override readonly value = "lambda";

  /**
   * Real ELB takes exactly one function per target group, which is what makes
   * a Lambda target group a pointer at a function rather than a pool.
   */
  public override readonly maximumTargets = 1;

  /**
   * Refuse a protocol or port, which a function has no use for.
   */
  override validateGroup(properties: SimElbV2TargetGroupShape): void {
    if (properties.protocol !== undefined || properties.port !== undefined) {
      throw new SimElbV2InvalidConfigurationRequestException(
        "A lambda target group takes no Protocol or Port, because the load " +
          "balancer invokes the function rather than connecting to it",
      );
    }
  }

  /**
   * Refuse anything but a function ARN, and refuse a port with it.
   */
  override validateTarget(target: SimElbV2TargetShape): void {
    if (!functionArn.test(target.id)) {
      throw new SimElbV2InvalidTargetException(
        `Target '${target.id}' is not a Lambda function ARN. A lambda target ` +
          `group registers a function by its ARN.`,
      );
    }

    if (target.port !== undefined) {
      throw new SimElbV2InvalidTargetException(
        `Target '${target.id}' cannot carry a Port, because a function is ` +
          `invoked rather than connected to`,
      );
    }
  }
}

/**
 * A target group holding addresses, which is what a container service
 * registers itself as.
 */
class SimElbV2IpTargetType extends SimElbV2TargetType {
  public override readonly value = "ip";

  /**
   * Far below what real ELB allows, and high enough that nothing a test
   * registers reaches it.
   */
  public override readonly maximumTargets = 1000;

  /**
   * Require the protocol and port real ELB requires of an address group.
   */
  override validateGroup(properties: SimElbV2TargetGroupShape): void {
    if (properties.protocol === undefined || properties.port === undefined) {
      throw new SimElbV2InvalidConfigurationRequestException(
        "An ip target group requires a Protocol and a Port, which is where a " +
          "registered address is reached",
      );
    }
  }

  /**
   * Refuse an Id that is not an address.
   */
  override validateTarget(target: SimElbV2TargetShape): void {
    if (!isIpAddress(target.id)) {
      throw new SimElbV2InvalidTargetException(
        `Target '${target.id}' is not an IP address. An ip target group ` +
          `registers addresses rather than instance ids or ARNs.`,
      );
    }
  }
}

const targetTypes = new Map<string, SimElbV2TargetType>([
  ["lambda", new SimElbV2LambdaTargetType()],
  ["ip", new SimElbV2IpTargetType()],
]);

/**
 * Read the target type a request names.
 *
 * A request naming none is refused rather than defaulted. Real ELB defaults to
 * `instance`, which is not simulated, so silently choosing one of the two
 * types that are would create a group the request did not ask for.
 */
export function simElbV2TargetType(
  value: string | undefined,
): SimElbV2TargetType {
  if (value === undefined) {
    throw new SimElbV2UnsimulatedInputException(
      "TargetType is required here. Real ELB defaults it to 'instance', " +
        "which is not simulated, so a target group has to name 'lambda' or " +
        "'ip' rather than be given one of them.",
    );
  }

  const targetType = targetTypes.get(value);

  if (targetType === undefined) {
    throw new SimElbV2UnsimulatedInputException(
      `TargetType '${value}' is not simulated. There are no EC2 instances or ` +
        `nested load balancers here for it to mean anything about, so it is ` +
        `refused rather than accepted and ignored. Simulated target types are ` +
        `${targetTypes.keys().toArray().join(" and ")}.`,
    );
  }

  return targetType;
}
