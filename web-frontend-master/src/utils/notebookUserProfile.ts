/**
 * 每个登录账号一条本地资料（登录用户名）
 * 以服务端账号为准，此处作本地缓存，用于侧栏等展示
 */

const PROFILES_KEY = 'notebook_user_profiles_v1';

export type NotebookUserProfile = {
  /** 与 token.userCode 一致 */
  notebookId: string;
};

type ProfileMap = Record<string, NotebookUserProfile>;

function pickNotebookIdFromLegacy(v: object, key: string): string {
  const p = v as { notebookId?: string; wxId?: string; systemId?: string };
  const a = p.notebookId && String(p.notebookId).trim();
  if (a) return a;
  const b = p.wxId && String(p.wxId).trim();
  if (b) return b;
  const c = p.systemId && String(p.systemId).trim();
  if (c) return c;
  return key;
}

function parseAndClean(raw: string | null): ProfileMap {
  if (!raw) return {};
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (!o || typeof o !== 'object') return {};
    const map: ProfileMap = {};
    for (const [key, v] of Object.entries(o)) {
      if (v && typeof v === 'object') {
        map[key] = { notebookId: pickNotebookIdFromLegacy(v as object, key) };
      }
    }
    return map;
  } catch {
    return {};
  }
}

function loadMap(): ProfileMap {
  return parseAndClean(localStorage.getItem(PROFILES_KEY));
}

function saveMap(map: ProfileMap) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(map));
}

function normalizeLoginKey(loginName: string): string {
  return loginName.trim();
}

const NOTEBOOK_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{5,19}$/;

/**
 * 用户名格式不通过时，返回**具体原因**；通过则返回 `null`。
 *（「是否全站唯一」须由服务器判断，不在这里。）
 */
export function getNotebookIdFormatError(s: string): string | null {
  const t = s.trim();
  if (t.length === 0) return '请输入用户名';
  if (/\s/.test(t)) return '用户名不能包含空格';
  if (t.length < 6) return '用户名长度不能少于 6 位';
  if (t.length > 20) return '用户名长度不能超过 20 位';
  if (!/^[a-zA-Z]/.test(t)) {
    if (/[0-9]/.test(t[0]!)) return '用户名须以英文字母开头，不能以数字开头';
    return '用户名须以英文字母开头';
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(t)) {
    return '除首字符外，用户名仅可包含字母、数字、下划线和减号';
  }
  return null;
}

/** 与后端 `NotebookIdUtils.isValid` 规则一致；等价于 getNotebookIdFormatError(s) === null */
export function isValidNotebookId(s: string): boolean {
  return NOTEBOOK_ID_PATTERN.test(s.trim());
}

export function isNotebookIdTaken(notebookId: string, exceptLoginKey: string): boolean {
  const id = notebookId.trim();
  if (!id) return false;
  const map = loadMap();
  for (const [key, p] of Object.entries(map)) {
    if (key === exceptLoginKey) continue;
    if (p.notebookId && p.notebookId.trim() === id) return true;
  }
  return false;
}

export function getProfile(loginKey: string): NotebookUserProfile | undefined {
  const k = normalizeLoginKey(loginKey);
  if (!k) return undefined;
  return loadMap()[k];
}

export function ensureProfile(loginKey: string): NotebookUserProfile {
  const k = normalizeLoginKey(loginKey);
  const map = loadMap();
  if (map[k]) {
    return map[k]!;
  }
  const profile: NotebookUserProfile = { notebookId: k };
  map[k] = profile;
  saveMap(map);
  return profile;
}

/** 用当前登录 Token 覆盖本地资料 */
export function applyNotebookProfileFromToken(token: API.Token | null | undefined): void {
  if (!token || token.accountType !== 'NOTEBOOK_USER') return;
  const code = token.userCode?.trim();
  if (!code) return;
  const map = loadMap();
  map[code] = { notebookId: code };
  saveMap(map);
}

export function migrateProfileLoginKey(oldKey: string, newKey: string): void {
  const o = oldKey.trim();
  const n = newKey.trim();
  if (!o || !n || o === n) return;
  const map = loadMap();
  const p = map[o];
  if (p) {
    p.notebookId = n;
    delete map[o];
    map[n] = p;
    saveMap(map);
  }
}

export function saveProfile(loginKey: string, patch: Partial<Pick<NotebookUserProfile, 'notebookId'>>) {
  const k = normalizeLoginKey(loginKey);
  if (!k) return;
  ensureProfile(k);
  const map = loadMap();
  const base = map[k];
  if (!base) return;
  if (patch.notebookId !== undefined) {
    const id = patch.notebookId.trim();
    const err = getNotebookIdFormatError(id);
    if (err) {
      throw new Error(err);
    }
    if (isNotebookIdTaken(id, k)) {
      throw new Error('该用户名已被占用');
    }
    map[k] = { ...base, notebookId: id };
    saveMap(map);
  }
}
