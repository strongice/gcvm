export type Group = { id: number; full_path: string };
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
export type UIConfig = { auto_refresh_enabled: boolean; auto_refresh_sec: number };
export type ApiError = { status: number; message?: string };

