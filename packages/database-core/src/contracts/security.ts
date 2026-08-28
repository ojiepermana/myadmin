import type { ProviderContext } from './metadata';
import type { Grant, Page, PageRequest, Principal } from '../models';

export interface PrincipalMutation {
  principal: Principal;
  credential?: string;
}

/** Database principals and grants. Secrets never appear in returned models. */
export interface SecurityPort {
  principals(context: ProviderContext, page?: PageRequest): Promise<Page<Principal>>;
  createPrincipal(context: ProviderContext, request: PrincipalMutation): Promise<void>;
  alterPrincipal(context: ProviderContext, request: PrincipalMutation): Promise<void>;
  dropPrincipal(context: ProviderContext, name: string): Promise<void>;
  resetCredential(context: ProviderContext, request: PrincipalMutation): Promise<void>;
  grants(context: ProviderContext, page?: PageRequest): Promise<Page<Grant>>;
  grant(context: ProviderContext, grant: Grant): Promise<void>;
  revoke(context: ProviderContext, grant: Grant): Promise<void>;
}
