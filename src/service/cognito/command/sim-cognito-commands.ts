import type { SimClock } from "../../../util/clock/sim-clock.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimCognitoUserPoolClientFactory } from "../user-pool/client/sim-cognito-user-pool-client-factory.js";
import { SimCognitoUserPoolFactory } from "../user-pool/sim-cognito-user-pool-factory.js";
import type { SimCognitoUserPoolStore } from "../user-pool/sim-cognito-user-pool-store.js";
import { SimCognitoUserFactory } from "../user-pool/user/sim-cognito-user-factory.js";
import { SimCognitoAuthorizer } from "./authorize/sim-cognito-authorizer.js";
import { SimCognitoListUserPoolClients } from "./client/sim-cognito-list-user-pool-clients.js";
import { SimCognitoUserPoolClientCommands } from "./client/sim-cognito-user-pool-client-commands.js";
import { SimCognitoListUsers } from "./user/sim-cognito-list-users.js";
import { SimCognitoUserCommands } from "./user/sim-cognito-user-commands.js";
import { SimCognitoUserResolver } from "./user/sim-cognito-user-resolver.js";
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
  public readonly userUpdates: SimCognitoUserUpdateCommands;
  public readonly listUsers: SimCognitoListUsers;

  constructor(properties: SimCognitoCommandsProperties) {
    const { accountRegionScope, iam, clock, pools } = properties;
    const authorizer = new SimCognitoAuthorizer({ iam, accountRegionScope });
    const resolver = new SimCognitoUserResolver({ pools, authorizer });

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
    this.users = new SimCognitoUserCommands({
      resolver,
      userFactory: new SimCognitoUserFactory({ clock }),
    });
    this.userUpdates = new SimCognitoUserUpdateCommands({ resolver });
    this.listUsers = new SimCognitoListUsers({ resolver });
  }
}
