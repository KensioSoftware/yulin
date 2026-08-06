import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCognitoUserPoolClientFactory } from "../user-pool/client/sim-cognito-user-pool-client-factory.js";
import { SimCognitoGroupFactory } from "../user-pool/group/sim-cognito-group-factory.js";
import { SimCognitoUserPoolFactory } from "../user-pool/sim-cognito-user-pool-factory.js";
import type { SimCognitoUserPoolStore } from "../user-pool/sim-cognito-user-pool-store.js";
import { SimCognitoUserFactory } from "../user-pool/user/sim-cognito-user-factory.js";
import { SimCognitoAuthCommands } from "./auth/sim-cognito-auth-commands.js";
import { SimCognitoAuthResolver } from "./auth/sim-cognito-auth-resolver.js";
import { SimCognitoAuthorizer } from "./authorize/sim-cognito-authorizer.js";
import { SimCognitoListUserPoolClients } from "./client/sim-cognito-list-user-pool-clients.js";
import { SimCognitoGroupCommands } from "./group/sim-cognito-group-commands.js";
import { SimCognitoGroupMembershipCommands } from "./group/sim-cognito-group-membership-commands.js";
import { SimCognitoListGroups } from "./group/sim-cognito-list-groups.js";
import { SimCognitoUserPoolClientCommands } from "./client/sim-cognito-user-pool-client-commands.js";
import { SimCognitoListUsers } from "./user/sim-cognito-list-users.js";
import { SimCognitoSignUpCommands } from "./user/sim-cognito-sign-up-commands.js";
import { SimCognitoUserCommands } from "./user/sim-cognito-user-commands.js";
import { SimCognitoRequestResolver } from "./sim-cognito-request-resolver.js";
import { SimCognitoUserUpdateCommands } from "./user/sim-cognito-user-update-commands.js";
import { SimCognitoListUserPools } from "./user-pool/sim-cognito-list-user-pools.js";
import { SimCognitoUserPoolCommands } from "./user-pool/sim-cognito-user-pool-commands.js";

interface SimCognitoCommandsProperties {
  readonly accountRegionScope: SimAwsAccountRegionScope;
  readonly iam: SimIamInterServiceAuthZ;
  readonly clock: SimClock;
  readonly pools: SimCognitoUserPoolStore;
}

/**
 * The command handlers of one simulated Cognito scope.
 *
 * They share an authorizer, a pool store and a clock, so they are built
 * together here rather than in the service facade, which is left as
 * delegation.
 */
export class SimCognitoCommands {
  public readonly userPools: SimCognitoUserPoolCommands;
  public readonly listUserPools: SimCognitoListUserPools;
  public readonly clients: SimCognitoUserPoolClientCommands;
  public readonly listClients: SimCognitoListUserPoolClients;
  public readonly users: SimCognitoUserCommands;
  public readonly signUp: SimCognitoSignUpCommands;
  public readonly userUpdates: SimCognitoUserUpdateCommands;
  public readonly listUsers: SimCognitoListUsers;
  public readonly groups: SimCognitoGroupCommands;
  public readonly groupMembership: SimCognitoGroupMembershipCommands;
  public readonly listGroups: SimCognitoListGroups;
  public readonly auth: SimCognitoAuthCommands;

  constructor(properties: SimCognitoCommandsProperties) {
    const { accountRegionScope, iam, clock, pools } = properties;
    const authorizer = new SimCognitoAuthorizer({ iam, accountRegionScope });
    const resolver = new SimCognitoRequestResolver({ pools, authorizer });
    const authResolver = new SimCognitoAuthResolver({ resolver, pools });
    const userFactory = new SimCognitoUserFactory({ clock });

    this.userPools = new SimCognitoUserPoolCommands({
      pools,
      poolFactory: new SimCognitoUserPoolFactory({
        accountRegionScope,
        pools,
        clock,
      }),
      authorizer,
    });
    this.listUserPools = new SimCognitoListUserPools({ pools, authorizer });
    this.clients = new SimCognitoUserPoolClientCommands({
      pools,
      clientFactory: new SimCognitoUserPoolClientFactory({ clock }),
      authorizer,
    });
    this.listClients = new SimCognitoListUserPoolClients({ pools, authorizer });
    this.users = new SimCognitoUserCommands({ resolver, userFactory });
    this.signUp = new SimCognitoSignUpCommands({
      authResolver,
      resolver,
      userFactory,
    });
    this.userUpdates = new SimCognitoUserUpdateCommands({ resolver });
    this.listUsers = new SimCognitoListUsers({ resolver });
    this.groups = new SimCognitoGroupCommands({
      resolver,
      groupFactory: new SimCognitoGroupFactory({ clock }),
    });
    this.groupMembership = new SimCognitoGroupMembershipCommands({ resolver });
    this.listGroups = new SimCognitoListGroups({ resolver });
    this.auth = new SimCognitoAuthCommands({
      resolver,
      authResolver,
      pools,
      clock,
    });
  }
}
