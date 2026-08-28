import type { ProviderContext } from './metadata';
import type {
  GrantApplyResult,
  GrantChange,
  GrantEntry,
  GrantPreview,
  Page,
  PageRequest,
  Principal,
  PrincipalAttribute,
  PrivilegeCatalog,
} from '../models';

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
  privilegeCatalog(context: ProviderContext): Promise<PrivilegeCatalog>;
  grants(context: ProviderContext, principal: string): Promise<GrantEntry[]>;
  preview(context: ProviderContext, changes: readonly GrantChange[]): Promise<GrantPreview>;
  apply(context: ProviderContext, changes: readonly GrantChange[]): Promise<GrantApplyResult>;
}
