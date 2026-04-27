/** 笔记本数据：持久化到 localStorage，后续可替换为后端 API */

import { getNotebookLoginKey } from '@/utils/displayUserName';

export type NotebookCategory = {
  id: number;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type NotebookNote = {
  id: string;
  title: string;
  content: string;
  /** 富文本 HTML，与 content 同时维护；无则视为纯文本 */
  richContent?: string;
  time: string;
  categoryIds: number[];
  /** 收藏：已同步后端的笔记由接口返回；仅本地 id 的笔记仅存于 localStorage */
  favorite?: boolean;
};

export type NotebookData = {
  categories: NotebookCategory[];
  notes: NotebookNote[];
};

export type NoteSaveSnapshot = {
  title: string;
  content: string;
  richContent?: string;
  savedAt: string;
};

export type NoteSaveHistory = {
  previous?: NoteSaveSnapshot;
  current: NoteSaveSnapshot;
};

/**
 * 与列表/详情合并收藏状态：接口可能返回 boolean，也可能为 0/1（JDBC/JSON 行为差异）。
 * 未识别到明确真假时，回落到本地 prev，避免一刷新就丢收藏。
 */
export function mergeNoteFavorite(
  fromApi: unknown,
  prevFavorite: boolean | undefined
): boolean {
  if (fromApi === true || fromApi === 1) return true;
  if (fromApi === false || fromApi === 0) return false;
  if (typeof fromApi === 'string') {
    const s = fromApi.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === '') return false;
  }
  return Boolean(prevFavorite);
}

/** 未分账号时的旧版全局键（仅用于一次性迁移到按账号的 v2 键） */
const LEGACY_STORAGE_KEY = 'notebook_app_data_v1';
const LEGACY_SAVE_HISTORY_KEY = 'notebook_note_save_history_v1';

function scopedNotebookDataKey(): string {
  const k = getNotebookLoginKey().trim() || '__nologin__';
  return `notebook_app_data_v2::${k}`;
}

function scopedSaveHistoryKey(): string {
  const k = getNotebookLoginKey().trim() || '__nologin__';
  return `notebook_note_save_history_v2::${k}`;
}

const defaultCategories: NotebookCategory[] = [
  { id: 1, name: '课程学习', description: '课程知识点、作业复盘与考试重点整理。' },
  { id: 2, name: '项目备忘', description: '需求拆解、任务推进与问题记录。' },
  { id: 3, name: '生活随笔', description: '日常记录、灵感片段与阶段总结。' },
  { id: 4, name: '读书笔记', description: '阅读摘录、观点整理与读后反思。' },
];

function normalizeCategoryIds(
  note: Partial<NotebookNote> & { categoryId?: number | null },
  categoryIdSet: Set<number>,
): number[] {
  const fromArray = Array.isArray(note.categoryIds) ? note.categoryIds : [];
  const fromLegacy = note.categoryId === null || note.categoryId === undefined ? [] : [note.categoryId];
  const merged = [...fromArray, ...fromLegacy]
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && categoryIdSet.has(id));
  return Array.from(new Set(merged));
}

export function saveNotebookData(data: NotebookData) {
  localStorage.setItem(scopedNotebookDataKey(), JSON.stringify(data));
}

function migrateLegacyNotebookIfPresent(targetDataKey: string): void {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacy || localStorage.getItem(targetDataKey)) return;
    localStorage.setItem(targetDataKey, legacy);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    const hist = localStorage.getItem(LEGACY_SAVE_HISTORY_KEY);
    if (hist) {
      const hKey = scopedSaveHistoryKey();
      if (!localStorage.getItem(hKey)) {
        localStorage.setItem(hKey, hist);
      }
      localStorage.removeItem(LEGACY_SAVE_HISTORY_KEY);
    }
  } catch {
    /* ignore */
  }
}

function emptyNotebookData(): NotebookData {
  return { categories: defaultCategories, notes: [] };
}

export function loadNotebookData(): NotebookData {
  const key = scopedNotebookDataKey();
  try {
    migrateLegacyNotebookIfPresent(key);
    const raw = localStorage.getItem(key);
    if (!raw) {
      const data = emptyNotebookData();
      saveNotebookData(data);
      return data;
    }
    const o = JSON.parse(raw) as Partial<NotebookData>;
    const categories =
      Array.isArray(o.categories) && o.categories.length ? o.categories : defaultCategories;
    const categoryIdSet = new Set(categories.map((x) => x.id));
    const noteRows = o.notes;
    const notes =
      Array.isArray(noteRows) && noteRows.length
        ? noteRows.map((n) => ({
            id: typeof n.id === 'string' ? n.id : `n_${Math.random().toString(36).slice(2, 11)}`,
            title: typeof n.title === 'string' ? n.title : '未命名笔记',
            content: typeof n.content === 'string' ? n.content : '',
            richContent: typeof n.richContent === 'string' ? n.richContent : undefined,
            time: typeof n.time === 'string' ? n.time : new Date().toLocaleString(),
            categoryIds: normalizeCategoryIds(
              n as Partial<NotebookNote> & { categoryId?: number | null },
              categoryIdSet,
            ),
            favorite: Boolean(n.favorite),
          }))
        : [];
    return { categories, notes };
  } catch {
    return emptyNotebookData();
  }
}

export function loadNoteSaveHistories(): Record<string, NoteSaveHistory> {
  try {
    const raw = localStorage.getItem(scopedSaveHistoryKey());
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, NoteSaveHistory>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNoteSaveHistories(histories: Record<string, NoteSaveHistory>) {
  localStorage.setItem(scopedSaveHistoryKey(), JSON.stringify(histories));
}

export function recordNoteSaveSnapshot(noteId: string, snapshot: NoteSaveSnapshot) {
  const histories = loadNoteSaveHistories();
  const prev = histories[noteId];
  histories[noteId] = {
    previous: prev?.current,
    current: snapshot,
  };
  saveNoteSaveHistories(histories);
}

function scopedDataKeyFor(loginKey: string): string {
  const k = loginKey.trim() || '__nologin__';
  return `notebook_app_data_v2::${k}`;
}

function scopedHistoryKeyFor(loginKey: string): string {
  const k = loginKey.trim() || '__nologin__';
  return `notebook_note_save_history_v2::${k}`;
}

/** 修改 Notebook 登录 ID 后迁移本地笔记分桶数据 */
export function migrateLocalNotebookStorageOnLoginIdChange(oldKey: string, newKey: string): void {
  const o = oldKey.trim();
  const n = newKey.trim();
  if (!o || !n || o === n) return;
  const dkO = scopedDataKeyFor(o);
  const dkN = scopedDataKeyFor(n);
  const hkO = scopedHistoryKeyFor(o);
  const hkN = scopedHistoryKeyFor(n);
  try {
    const dO = localStorage.getItem(dkO);
    if (dO && !localStorage.getItem(dkN)) {
      localStorage.setItem(dkN, dO);
    }
    localStorage.removeItem(dkO);
    const hO = localStorage.getItem(hkO);
    if (hO && !localStorage.getItem(hkN)) {
      localStorage.setItem(hkN, hO);
    }
    localStorage.removeItem(hkO);
  } catch {
    /* ignore */
  }
}

export function categoryNameById(categories: NotebookCategory[], id: number | null | undefined) {
  if (id === null || id === undefined) return '未分类';
  const c = categories.find((x) => x.id === id);
  return c ? c.name : '未分类';
}

export function categoryNamesByIds(categories: NotebookCategory[], ids: number[] | undefined) {
  if (!ids?.length) return '未分类';
  const names = ids
    .map((id) => categories.find((x) => x.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return names.length ? names.join('、') : '未分类';
}
