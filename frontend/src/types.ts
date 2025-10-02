export type GroupSummary = {
  id: number;
  name: string;
  full_path: string;
  parent_id: number | null;
  projects_count?: number;
  subgroups_count?: number;
};

export type GroupTreeNode = {
  group: GroupSummary;
  children: GroupTreeNode[];
};

export type Group = GroupSummary;

export type GroupNodeItem = {
  group: GroupSummary;
  children_count: number;
  has_children: boolean;
};

export type GroupPageResponse = {
  items: GroupNodeItem[];
  total: number;
  has_more: boolean;
  next_cursor?: string | null;
  hash?: string;
  last_modified?: string;
  last_modified_http?: string;
  parent_id?: number;
};

export type ProjectListPage = {
  items: Project[];
  next_page?: number | null;
  has_more?: boolean;
};

export type GroupTreeResponse = {
  changed: boolean;
  hash: string;
  last_modified: string;
  last_modified_http?: string;
  tree?: GroupTreeNode[];
};
export type Project = {
  id: number;
  name: string;
  path_with_namespace?: string;
  namespace_id?: number;
  namespace_full_path?: string;
};

export type VarSummary = {
  key: string;
  variable_type?: 'env_var' | 'file' | string;
  environment_scope: string;
  protected: boolean;
  masked: boolean;
  raw: boolean;           // expand = !raw
  hidden?: boolean;       // GitLab 17.4+
};

export type VarDetail = VarSummary & { value: string | undefined };
export type VarEditing = VarDetail & { __originalKey?: string; __originalEnv?: string };

export type Health = { ok: boolean; user?: { id: number; username?: string; name?: string }; base_url?: string };
export type ApiError = { status: number; message?: string; json?: any };
