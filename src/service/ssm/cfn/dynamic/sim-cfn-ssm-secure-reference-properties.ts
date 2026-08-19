/**
 * The Resource properties real CloudFormation reads an `ssm-secure` dynamic
 * reference in.
 *
 * Every other property refuses one, which is a rule worth keeping because a
 * template breaking it is wrong wherever it deploys. The list is short and
 * fixed, and AWS documents it in full:
 * https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/dynamic-references-ssm-secure-strings.html
 *
 * `AWS::IAM::User` `LoginProfile.Password` is the only pair a simulated
 * Resource holds today. The other ten name Resource types nothing here
 * simulates, and they are listed anyway so that the rule is the documented one
 * rather than the part of it this simulation happens to reach.
 */
const acceptingProperties: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["AWS::DirectoryService::MicrosoftAD", new Set(["Password"])],
  ["AWS::DirectoryService::SimpleAD", new Set(["Password"])],
  ["AWS::ElastiCache::ReplicationGroup", new Set(["AuthToken"])],
  ["AWS::IAM::User", new Set(["LoginProfile.Password"])],
  [
    "AWS::KinesisFirehose::DeliveryStream",
    new Set(["RedshiftDestinationConfiguration.Password"]),
  ],
  ["AWS::OpsWorks::App", new Set(["Source.Password"])],
  [
    "AWS::OpsWorks::Stack",
    new Set(["CustomCookbooksSource.Password", "RdsDbInstances.DbPassword"]),
  ],
  ["AWS::RDS::DBCluster", new Set(["MasterUserPassword"])],
  ["AWS::RDS::DBInstance", new Set(["MasterUserPassword"])],
  ["AWS::Redshift::Cluster", new Set(["MasterUserPassword"])],
]);

/** A list position in a resolved property path, such as the `0` of `Tags.0`. */
const listPosition = /^\d+$/;

/**
 * Whether an `ssm-secure` reference is accepted in one Resource property.
 *
 * A Resource with no type in its template accepts none, since there is nothing
 * to match it against.
 */
export function acceptsSsmSecureReference(
  resourceType: string | undefined,
  propertyPath: string,
): boolean {
  if (resourceType === undefined) {
    return false;
  }

  return (
    acceptingProperties.get(resourceType)?.has(namedProperty(propertyPath)) ===
    true
  );
}

/**
 * The property a resolved path names, with the list positions taken out.
 *
 * `RdsDbInstances` holds a list, so the path to a password inside it reads
 * `RdsDbInstances.0.DbPassword` while the documented property is
 * `RdsDbInstances.DbPassword`.
 */
function namedProperty(propertyPath: string): string {
  return propertyPath
    .split(".")
    .filter((segment) => !listPosition.test(segment))
    .join(".");
}
