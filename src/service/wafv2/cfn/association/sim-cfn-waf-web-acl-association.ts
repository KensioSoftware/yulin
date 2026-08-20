/**
 * One AWS::WAFv2::WebACLAssociation Resource, as CloudFormation holds it.
 *
 * WAFv2 keeps an association against the resource it protects rather than as a
 * thing of its own, so there is nothing in the service for a deployed Resource
 * to point at. This is what CloudFormation holds instead: the two ARNs the
 * Resource named, which is what teardown needs to take the association off
 * again and what `Ref` answers with.
 */
export class SimWafCfnWebAclAssociation {
  public readonly resourceArn: string;
  public readonly webAclArn: string;

  constructor(properties: {
    readonly resourceArn: string;
    readonly webAclArn: string;
  }) {
    this.resourceArn = properties.resourceArn;
    this.webAclArn = properties.webAclArn;
  }
}
