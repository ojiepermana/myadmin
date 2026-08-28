import type { ProviderContext } from './metadata';
import type { Grant, Page, PageRequest, Principal, PrincipalAttribute } from '../models';

export type PrincipalFormFieldType = 'text' | 'password' | 'boolean' | 'number' | 'datetime';

export interface PrincipalFormField {
  key: string;
  label: string;
  type: PrincipalFormFieldType;
  required?: boolean;
  secret?: boolean;
  min?: number;
  max?: number;
  options?: string[];
}

export interface PrincipalFormDescription {
  create: PrincipalFormField[];
  edit: PrincipalFormField[];
}

export interface PrincipalPageRequest extends PageRequest {
  query?: string;
}

export interface PrincipalMutation {
  principal: Principal;
  changes?: PrincipalAttribute[];
  credential?: string;
}

/** Database principals and grants. Secrets never appear in returned models. */
export interface SecurityPort {
  principals(context: ProviderContext, page?: PrincipalPageRequest): Promise<Page<Principal>>;
  describePrincipalForm(context: ProviderContext): Promise<PrincipalFormDescription>;
  createPrincipal(context: ProviderContext, request: PrincipalMutation): Promise<void>;
  alterPrincipal(context: ProviderContext, request: PrincipalMutation): Promise<void>;
  dropPrincipal(context: ProviderContext, name: string): Promise<void>;
  resetCredential(context: ProviderContext, request: PrincipalMutation): Promise<void>;
  grants(context: ProviderContext, page?: PageRequest): Promise<Page<Grant>>;
  grant(context: ProviderContext, grant: Grant): Promise<void>;
  revoke(context: ProviderContext, grant: Grant): Promise<void>;
}
