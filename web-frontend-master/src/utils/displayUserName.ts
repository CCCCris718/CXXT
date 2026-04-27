import { ensureProfile, getProfile } from './notebookUserProfile';

/** @deprecated 仅兼容旧版，新逻辑用 notebook 资料 */
const LEGACY_STORAGE_KEY = 'notebook_login_display_name';
const LAST_LOGIN_KEY = 'notebook_last_login_key';

const NOTEBOOK_ACCOUNT = 'NOTEBOOK_USER';

function pickFromToken(token?: API.Token | null): string | undefined {
  // 兼容不同后端字段命名，按优先级提取可展示用户名。
  if (!token || typeof token !== 'object') return undefined;
  const o = token as Record<string, unknown>;
  const keys = ['userName', 'name', 'loginName', 'account'] as const;
  for (const k of keys) {
    const v = o[k];
    if (v !== null && v !== undefined && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  const code = o.userCode;
  if (code !== null && code !== undefined && String(code).trim() !== '') {
    return String(code).trim();
  }
  return undefined;
}

export function getLastLoginKey(): string {
  try {
    return typeof window !== 'undefined' ? localStorage.getItem(LAST_LOGIN_KEY)?.trim() || '' : '';
  } catch {
    return '';
  }
}

/** 当前账号在本地资料与数据分桶中的键：笔记本用户固定为 Token.userCode（登录用户名） */
export function getNotebookLoginKey(token?: API.Token | null): string {
  if (!token) return getLastLoginKey();
  if (token.accountType === NOTEBOOK_ACCOUNT && token.userCode && String(token.userCode).trim() !== '') {
    return String(token.userCode).trim();
  }
  return pickFromToken(token) || getLastLoginKey();
}

/** 登录成功后写入「最近使用的登录用户名」，并确保本地资料占位 */
export function setLoginDisplayName(name: string) {
  const t = name?.trim();
  if (!t || typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_LOGIN_KEY, t);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    ensureProfile(t);
  } catch {
    /* ignore */
  }
}

export function clearLoginDisplayName() {
  // 退出登录时清理“最近登录账号”痕迹，避免错误复用。
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(LAST_LOGIN_KEY);
    }
  } catch {
    /* ignore */
  }
}

/** 侧栏主标题：优先本地 profile，其次 Token 字段，再退回到登录名 */
export function getDisplayUserName(token?: API.Token | null): string {
  // 展示名优先级：本地 profile -> token 字段 -> 最近登录键。
  if (!token) return '';
  const loginKey = getNotebookLoginKey(token);
  if (!loginKey) return '';
  const profile = getProfile(loginKey) ?? ensureProfile(loginKey);
  const id = profile.notebookId?.trim();
  if (id) return id;
  return pickFromToken(token) || loginKey;
}

/** 侧栏副文案 */
export function getSidebarSubtitle(token?: API.Token | null): string {
  // 侧栏副标题统一展示“用户名：xxx”格式。
  if (!token) return '';
  const loginKey = getNotebookLoginKey(token);
  if (!loginKey) return '';
  const p = getProfile(loginKey) ?? ensureProfile(loginKey);
  return `用户名：${p.notebookId}`;
}
