/**
 * The CloudFormation Resource types simulated Kinesis creates.
 *
 * Named here rather than spelled out where they are used, because each one is
 * written twice: once by the factory dispatching on it, and once by the
 * refusals that quote it back to whoever wrote the template.
 */
export const kinesisStreamResourceType = "AWS::Kinesis::Stream";
