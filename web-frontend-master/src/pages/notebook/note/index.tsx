import { history, useLocation, useModel } from '@umijs/max';
import { Button, Modal, Spin, message } from 'antd';
import DOMPurify from 'dompurify';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { APP_LOGIN_PATH } from '@/constants/auth';
import { logout } from '@/services/api/authentication';
import {
  addNotebookNote,
  deleteNotebookNotes,
  getNotebookNote,
  listNotebookCategories,
  listNotebookNotes,
  summarizeNotebookText,
  translateNotebookText,
  updateNotebookNote,
  updateNotebookNoteFavorite,
} from '@/services/api/notebook';
import {
  clearLoginDisplayName,
  getDisplayUserName,
} from '@/utils/displayUserName';
import AutoFitOneLine from '../components/AutoFitOneLine';
import {
  categoryNameById,
  categoryNamesByIds,
  loadNotebookData,
  mergeNoteFavorite,
  recordNoteSaveSnapshot,
  type NotebookData,
  type NotebookNote,
  saveNotebookData,
} from './storage';
import './index.less';

// 笔记主界面：列表 + contenteditable 正文，数据走 notebook API，本地快照在 storage.ts（IndexedDB + 合并策略）。
// 改富文本标签或清洗规则时，留意后端的 HTML 白名单，以及 normalizeBrowserBoldItalicToBackendTags 的兜底。

const CATEGORY_NAV_COLLAPSE_MAX = 2;
const NOTE_SETTINGS_KEY = 'notebook_note_settings_v1';
const FONT_SIZE_SUGGESTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48];
/** 正文可编辑区基础字号。勿与选区/工具栏的 editorFontSize 绑定，否则改选区会修改根节点 style，整篇未单独设字号的文字会跟着变 */
const EDITOR_BASE_FONT_PX = 16;

type FilterCat = 'all' | number;
type NoteSort = 'recent' | 'titleAsc' | 'titleDesc';
type AutoSaveInterval = 'off' | '30s' | '1m' | '5m';
type EditorFontFamily = 'yahei' | 'song' | 'hei' | 'kai' | 'mono';
type TextAlignMode = 'left' | 'center' | 'right';

type NoteSettings = {
  theme: 'light' | 'dark';
  fontScale: 'small' | 'medium' | 'large';
  language: 'zh-CN';
  defaultCategoryId: string;
  defaultSort: NoteSort;
  autoSaveInterval: AutoSaveInterval;
};

const DEFAULT_SETTINGS: NoteSettings = {
  theme: 'light',
  fontScale: 'medium',
  language: 'zh-CN',
  defaultCategoryId: '',
  defaultSort: 'recent',
  autoSaveInterval: 'off',
};

function loadNoteSettings(): NoteSettings {
  try {
    const raw = localStorage.getItem(NOTE_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<NoteSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function autoSaveIntervalToMs(interval: AutoSaveInterval): number | null {
  if (interval === '30s') return 30_000;
  if (interval === '1m') return 60_000;
  if (interval === '5m') return 300_000;
  return null;
}

function summarizeText(content: string) {
  const parts = content
    .split(/[。！？\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let summary = parts.length ? parts[0] : content.slice(0, 120);
  if (summary.length > 160) summary = `${summary.slice(0, 160)}…`;
  if (summary.length < content.length && !summary.endsWith('…') && !summary.endsWith('。')) {
    summary += '…';
  }
  return summary;
}

function toDisplayTime(time?: string) {
  if (!time) return new Date().toLocaleString();
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? time : d.toLocaleString();
}

function escapeHtmlText(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plainTextToFallbackHtml(plain: string) {
  const normalized = plain.replaceAll('\r\n', '\n');
  if (!normalized.trim()) return '<p><br></p>';
  return normalized
    .split('\n')
    .map((line) => {
      if (!line.trim()) return '<p><br></p>';
      return `<p>${escapeHtmlText(line)}</p>`;
    })
    .join('');
}

function sanitizeRichHtml(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });
}

function fontFamilyCssName(f: EditorFontFamily) {
  if (f === 'yahei') return '"Microsoft YaHei","PingFang SC",sans-serif';
  if (f === 'song') return '"SimSun","Songti SC",serif';
  if (f === 'hei') return '"SimHei","Heiti SC",sans-serif';
  if (f === 'kai') return '"KaiTi","Kaiti SC",serif';
  return '"Consolas","Courier New",monospace';
}

function fontFamilyForExec(f: EditorFontFamily) {
  if (f === 'yahei') return 'Microsoft YaHei';
  if (f === 'song') return 'SimSun';
  if (f === 'hei') return 'SimHei';
  if (f === 'kai') return 'KaiTi';
  return 'monospace';
}

/**
 * execCommand('bold'|'italic') 在多数浏览器里会生成/切换 <b>、<i>，而后端白名单为 strong、em；保存前统一为后者。
 * 用节点搬运代替 innerHTML，避免破坏已有子节点与顺序。
 */
function normalizeBrowserBoldItalicToBackendTags(root: HTMLElement) {
  if (typeof document === 'undefined') return;
  const bs = root.querySelectorAll('b');
  bs.forEach((b) => {
    if (!root.contains(b)) return;
    const s = document.createElement('strong');
    while (b.firstChild) {
      s.appendChild(b.firstChild);
    }
    const st = b.getAttribute('style');
    if (st) {
      s.setAttribute('style', st);
    }
    b.replaceWith(s);
  });
  const italics = root.querySelectorAll('i');
  italics.forEach((i) => {
    if (!root.contains(i) || i.closest('svg')) {
      return;
    }
    const em = document.createElement('em');
    while (i.firstChild) {
      em.appendChild(i.firstChild);
    }
    const st = i.getAttribute('style');
    if (st) {
      em.setAttribute('style', st);
    }
    i.replaceWith(em);
  });
}

/** 与工具栏高亮/撤销可用性一致的状态（随光标/选区在正文内变化） */
type ToolbarFormatState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  isHeading: boolean;
  isBody: boolean;
  align: TextAlignMode;
  canUndo: boolean;
  canRedo: boolean;
};

const TOOLBAR_FORMAT_INITIAL: ToolbarFormatState = {
  bold: false,
  italic: false,
  underline: false,
  isHeading: false,
  isBody: true,
  align: 'left',
  canUndo: false,
  canRedo: false,
};

// 下面一串小函数都是给工具栏用的：从 Selection 推断当前是否在编辑器里、块标签、h1/p、对齐方式等。

function selectionInEditorHost(editor: HTMLElement): boolean {
  if (typeof window === 'undefined') return false;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  return editor.contains(sel.anchorNode);
}

function getNearestBlockTag(editor: HTMLElement, sel: Selection): string | null {
  let n: Node | null = sel.anchorNode;
  if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
  while (n && n !== editor) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const name = (n as HTMLElement).tagName;
      if (/^H[1-6]$/i.test(name) || name === 'P' || name === 'DIV' || name === 'LI' || name === 'BLOCKQUOTE') {
        return name;
      }
    }
    n = n.parentNode;
  }
  return null;
}

function readInlineFromAncestors(
  editor: HTMLElement,
  sel: Selection,
): Pick<ToolbarFormatState, 'bold' | 'italic' | 'underline'> {
  let n: Node | null =
    sel.anchorNode?.nodeType === Node.TEXT_NODE
      ? (sel.anchorNode as Text).parentNode
      : sel.anchorNode;
  let bold = false;
  let italic = false;
  let underline = false;
  while (n && n !== editor) {
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      const t = el.tagName;
      if (t === 'STRONG' || t === 'B') {
        bold = true;
      }
      if (t === 'EM' || t === 'I') {
        italic = true;
      }
      if (t === 'U') {
        underline = true;
      }
      const { fontWeight, fontStyle, textDecoration } = el.style;
      if (fontWeight === 'bold' || fontWeight === '700' || fontWeight === '600') {
        bold = true;
      }
      if (fontStyle === 'italic') {
        italic = true;
      }
      if (textDecoration && textDecoration.includes('underline')) {
        underline = true;
      }
    }
    n = n.parentNode;
  }
  return { bold, italic, underline };
}

function alignFromBlock(
  editor: HTMLElement,
  sel: Selection,
): 'left' | 'center' | 'right' {
  let n: Node | null = sel.anchorNode;
  if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
  while (n && n !== editor) {
    if (n instanceof HTMLElement) {
      const s = n.style.textAlign;
      if (s === 'left' || s === 'right' || s === 'center' || s === 'start' || s === 'end') {
        if (s === 'center') return 'center';
        if (s === 'right' || s === 'end') return 'right';
        return 'left';
      }
    }
    n = n.parentNode;
  }
  n = sel.anchorNode;
  if (n?.nodeType === Node.TEXT_NODE) n = n.parentNode;
  while (n && n !== editor) {
    if (n instanceof HTMLElement) {
      const ta = getComputedStyle(n).textAlign;
      if (ta === 'center') return 'center';
      if (ta === 'right' || ta === 'end') return 'right';
      if (ta === 'left' || ta === 'start') return 'left';
    }
    n = n.parentNode;
  }
  return 'left';
}

function computeToolbarFormatState(editor: HTMLDivElement | null): ToolbarFormatState {
  if (typeof document === 'undefined' || !editor) {
    return { ...TOOLBAR_FORMAT_INITIAL, canUndo: false, canRedo: false };
  }
  if (!selectionInEditorHost(editor)) {
    return { ...TOOLBAR_FORMAT_INITIAL, canUndo: false, canRedo: false };
  }
  const sel = window.getSelection()!;
  let bold = false;
  let italic = false;
  let underline = false;
  try {
    bold = document.queryCommandState('bold');
  } catch {
    // ignore
  }
  try {
    italic = document.queryCommandState('italic');
  } catch {
    // ignore
  }
  try {
    underline = document.queryCommandState('underline');
  } catch {
    // ignore
  }
  const fromDom = readInlineFromAncestors(editor, sel);
  bold = bold || fromDom.bold;
  italic = italic || fromDom.italic;
  underline = underline || fromDom.underline;

  const block = getNearestBlockTag(editor, sel);
  const isH1 = block === 'H1';
  const isHeading = isH1;
  const isBody = !isH1;

  let align: TextAlignMode = 'left';
  let qLeft = false;
  let qCenter = false;
  let qRight = false;
  try {
    qLeft = document.queryCommandState('justifyLeft');
  } catch {
    // ignore
  }
  try {
    qCenter = document.queryCommandState('justifyCenter');
  } catch {
    // ignore
  }
  try {
    qRight = document.queryCommandState('justifyRight');
  } catch {
    // ignore
  }
  if (qCenter) {
    align = 'center';
  } else if (qRight) {
    align = 'right';
  } else if (qLeft) {
    align = 'left';
  } else {
    align = alignFromBlock(editor, sel);
  }

  let canUndo = false;
  let canRedo = false;
  try {
    canUndo = document.queryCommandEnabled('undo');
  } catch {
    canUndo = false;
  }
  try {
    canRedo = document.queryCommandEnabled('redo');
  } catch {
    canRedo = false;
  }
  return {
    bold,
    italic,
    underline,
    isHeading,
    isBody,
    align,
    canUndo,
    canRedo,
  };
}

// 状态机概览：currentNoteId、editorHtml、categories/notes 来自接口；定时自动保存读 settings.autoSaveInterval；关标签页前会 flush。

const NotePage: React.FC = () => {
  const { initialState, setInitialState } = useModel('@@initialState');
  const location = useLocation();
  const currentToken = initialState?.currentToken;

  const [data, setData] = useState<NotebookData>(() => loadNotebookData());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCat, setFilterCat] = useState<FilterCat>('all');
  const [search, setSearch] = useState('');
  const [categoryNavExpanded, setCategoryNavExpanded] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [aiResultModal, setAiResultModal] = useState<{
    open: boolean;
    title: string;
    text: string;
  }>({ open: false, title: '', text: '' });
  const [aiActionLoading, setAiActionLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NoteSettings>(() => loadNoteSettings());
  const [editorFontFamily, setEditorFontFamily] = useState<EditorFontFamily>('yahei');
  const [editorFontSize, setEditorFontSize] = useState(16);
  const [toolbarFormat, setToolbarFormat] = useState<ToolbarFormatState>(TOOLBAR_FORMAT_INITIAL);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorDirtyRef = useRef(false);
  const lastLoadedNoteIdRef = useRef<string | null>(null);
  const toolbarRafRef = useRef<number | null>(null);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveInFlightRef = useRef(false);
  const reloadRequestIdRef = useRef(0);
  const statusClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorBaseFontPx =
    settings.fontScale === 'small' ? 14 : settings.fontScale === 'large' ? 18 : EDITOR_BASE_FONT_PX;

  const scheduleToolbarFormatRefresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (toolbarRafRef.current !== null) {
      window.cancelAnimationFrame(toolbarRafRef.current);
    }
    toolbarRafRef.current = window.requestAnimationFrame(() => {
      toolbarRafRef.current = null;
      setToolbarFormat(computeToolbarFormatState(editorRef.current));
    });
  }, []);

  const reloadNotebookData = useCallback(async () => {
    const requestId = reloadRequestIdRef.current + 1;
    reloadRequestIdRef.current = requestId;
    try {
      const [categories, notePage] = await Promise.all([
        listNotebookCategories(),
        listNotebookNotes({ current: 1, pageSize: 500 }),
      ]);
      // 仅允许最后一次请求更新状态，避免慢请求覆盖新数据
      if (requestId !== reloadRequestIdRef.current) {
        return;
      }
      // 列表接口不返回富文本（见后端 buildNoteVOs(..., false)）。
      // 另外：有富文本时后端 content 来自 sanitize 后的 plainText()，与前端 innerText.trim() 可能不一致，
      // 若用「正文相同才保留 rich」会匹配失败，保存后 rich 被清空、编辑器按纯文本重绘。
      setData((prev) => {
        const prevById = new Map(prev.notes.map((n) => [n.id, n]));
        const nextData: NotebookData = {
          categories: (categories || []).flatMap((c) =>
            typeof c.id === 'number'
              ? [{ id: c.id, name: c.name || '未命名分类', createdAt: c.createdAt, updatedAt: c.updatedAt }]
              : [],
          ),
          notes: (notePage?.list || []).map((n) => {
            const id = String(n.id);
            const prevNote = prevById.get(id);
            const serverPlain = n.content || '';
            const fromApi = n.richContent;
            const hasRichFromApi = typeof fromApi === 'string' && fromApi.trim() !== '';
            const richContent = hasRichFromApi ? fromApi : prevNote?.richContent;
            return {
              id,
              title: n.title || '未命名笔记',
              content: serverPlain,
              richContent,
              time: toDisplayTime(n.updatedAt || n.createdAt),
              categoryIds: (n.categories || [])
                .map((c) => c.id)
                .filter((id): id is number => typeof id === 'number'),
              favorite: mergeNoteFavorite(n.favorite, prevNote?.favorite),
            };
          }),
        };
        saveNotebookData(nextData);
        return nextData;
      });
    } catch {
      message.error('加载后端笔记数据失败，已回退本地缓存');
    }
  }, []);

  useEffect(() => {
    void reloadNotebookData();
  }, [reloadNotebookData]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onSel = () => {
      scheduleToolbarFormatRefresh();
    };
    document.addEventListener('selectionchange', onSel);
    return () => {
      document.removeEventListener('selectionchange', onSel);
      if (toolbarRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(toolbarRafRef.current);
        toolbarRafRef.current = null;
      }
    };
  }, [scheduleToolbarFormatRefresh]);

  useEffect(() => {
    saveNotebookData(data);
  }, [data]);

  useEffect(() => {
    localStorage.setItem(NOTE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let dirty = false;
    if (params.get('openSettings') === '1') {
      setSettingsOpen(true);
      params.delete('openSettings');
      dirty = true;
    }
    const catParam = params.get('category');
    if (catParam !== null && catParam !== '') {
      const id = Number(catParam);
      if (!Number.isNaN(id) && data.categories.some((c) => c.id === id)) {
        setFilterCat(id);
      }
      params.delete('category');
      dirty = true;
    }
    if (dirty) {
      const rest = params.toString();
      history.replace(rest ? `/notebook/note?${rest}` : '/notebook/note');
    }
  }, [location.search, data.categories]);

  const filteredNotes = useMemo(() => {
    let list = data.notes;
    if (filterCat !== 'all') {
      list = list.filter((n) => n.categoryIds.includes(filterCat));
    }
    const kw = search.trim().toLowerCase();
    if (kw) {
      list = list.filter(
        (n) => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw),
      );
    }
    if (settings.defaultSort === 'titleAsc') {
      list = list.slice().sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
    } else if (settings.defaultSort === 'titleDesc') {
      list = list.slice().sort((a, b) => b.title.localeCompare(a.title, 'zh-CN'));
    } else {
      list = list.slice().sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
    }
    return list;
  }, [data.notes, filterCat, search, settings.defaultSort]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const noteParam = params.get('note');

    if (filteredNotes.length === 0) {
      setSelectedId(null);
      if (noteParam) {
        params.delete('note');
        const rest = params.toString();
        history.replace(rest ? `/notebook/note?${rest}` : '/notebook/note');
      }
      return;
    }

    if (noteParam) {
      if (filteredNotes.some((n) => n.id === noteParam)) {
        setSelectedId(noteParam);
        params.delete('note');
        const rest = params.toString();
        history.replace(rest ? `/notebook/note?${rest}` : '/notebook/note');
        return;
      }
      params.delete('note');
      const rest = params.toString();
      history.replace(rest ? `/notebook/note?${rest}` : '/notebook/note');
    }

    setSelectedId((prev) => {
      if (prev && filteredNotes.some((n) => n.id === prev)) return prev;
      return filteredNotes[0].id;
    });
  }, [filteredNotes, location.search]);

  const currentNote = useMemo(
    () => (selectedId ? data.notes.find((n) => n.id === selectedId) : undefined),
    [data.notes, selectedId],
  );

  useEffect(() => {
    if (!currentNote) {
      setToolbarFormat(TOOLBAR_FORMAT_INITIAL);
      return;
    }
    scheduleToolbarFormatRefresh();
  }, [currentNote, scheduleToolbarFormatRefresh]);

  const patchNote = useCallback((id: string, patch: Partial<NotebookNote>) => {
    setData((d) => ({
      ...d,
      notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }, []);

  /**
   * 列表接口不带富文本；刷新或清缓存后 state 里可能没有 richContent，但库里可能有。
   * 对当前选中的、已有服务端 id 且本地缺 rich 的笔记，拉一次详情以恢复格式显示。
   */
  useEffect(() => {
    if (!selectedId || !currentNote) return;
    if (String(currentNote.richContent || '').trim() !== '') return;
    const idNum = Number(currentNote.id);
    if (!Number.isInteger(idNum)) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await getNotebookNote({ id: idNum });
        if (cancelled || !detail) return;
        const rich = detail.richContent;
        if (typeof rich === 'string' && rich.trim() !== '') {
          patchNote(currentNote.id, {
            content: detail.content ?? currentNote.content,
            richContent: rich,
            time: toDisplayTime(
              detail.updatedAt !== null && detail.updatedAt !== undefined
                ? String(detail.updatedAt)
                : detail.createdAt !== null && detail.createdAt !== undefined
                  ? String(detail.createdAt)
                  : undefined,
            ),
          });
        }
      } catch {
        // 忽略：离线或权限失败时仍显示纯文本
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, currentNote, patchNote]);

  const showStatus = useCallback((text: string) => {
    if (statusClearTimerRef.current !== null) {
      clearTimeout(statusClearTimerRef.current);
      statusClearTimerRef.current = null;
    }
    if (!text.trim()) {
      setStatusText('');
      return;
    }
    setStatusText(text);
    statusClearTimerRef.current = setTimeout(() => {
      statusClearTimerRef.current = null;
      setStatusText('');
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (statusClearTimerRef.current !== null) {
        clearTimeout(statusClearTimerRef.current);
        statusClearTimerRef.current = null;
      }
    };
  }, []);

  const showAiResultModal = useCallback((title: string, text: string) => {
    setAiResultModal({ open: true, title, text });
  }, []);

  const readEditorSnapshot = useCallback(() => {
    const el = editorRef.current;
    if (!el) {
      return { plain: '', rich: '' };
    }
    return {
      plain: el.innerText || '',
      rich: sanitizeRichHtml(el.innerHTML || ''),
    };
  }, []);

  const commitEditorToState = useCallback(() => {
    if (!currentNote) return;
    const { plain, rich } = readEditorSnapshot();
    editorDirtyRef.current = true;
    if (plain === currentNote.content && (rich || '') === (currentNote.richContent || '')) {
      return;
    }
    patchNote(currentNote.id, { content: plain, richContent: rich });
  }, [currentNote, patchNote, readEditorSnapshot]);

  const runExec = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    if (typeof document === 'undefined') return;
    try {
      document.execCommand(command, false, value);
    } catch {
      // ignore
    }
    commitEditorToState();
    scheduleToolbarFormatRefresh();
  }, [commitEditorToState, scheduleToolbarFormatRefresh]);

  const activeRichContent = currentNote?.richContent;

  useLayoutEffect(() => {
    if (!selectedId) {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
      }
      editorDirtyRef.current = false;
      lastLoadedNoteIdRef.current = null;
      return;
    }
    if (lastLoadedNoteIdRef.current !== selectedId) {
      editorDirtyRef.current = false;
      lastLoadedNoteIdRef.current = selectedId;
    }
    if (editorDirtyRef.current) {
      return;
    }
    const el = editorRef.current;
    if (!el) {
      return;
    }
    const note = data.notes.find((n) => n.id === selectedId);
    if (!note) {
      return;
    }
    const nextHtml =
      note.richContent && note.richContent.trim() !== ''
        ? sanitizeRichHtml(note.richContent)
        : plainTextToFallbackHtml(note.content || '');
    if (el.innerHTML !== nextHtml) {
      el.innerHTML = nextHtml;
    }
  }, [selectedId, activeRichContent]);

  useLayoutEffect(() => {
    scheduleToolbarFormatRefresh();
  }, [selectedId, activeRichContent, scheduleToolbarFormatRefresh]);

  const handleEditorInput = useCallback(() => {
    if (!currentNote) return;
    editorDirtyRef.current = true;
    scheduleToolbarFormatRefresh();
  }, [currentNote, scheduleToolbarFormatRefresh]);

  /** 粘贴仅插入纯文本，避免从网页/Word 带入背景色等无法编辑的样式 */
  const handleEditorPaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!currentNote) return;
      const cd = e.clipboardData;
      let text = cd.getData('text/plain');
      if (!text) {
        const types = cd.types ? Array.from(cd.types) : [];
        if (types.includes('text/html')) {
          const html = cd.getData('text/html');
          if (html && typeof document !== 'undefined') {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            text = tmp.innerText || tmp.textContent || '';
          }
        }
      }
      if (!text) return;
      e.preventDefault();
      e.stopPropagation();
      editorRef.current?.focus();
      try {
        if (typeof document !== 'undefined') {
          document.execCommand('insertText', false, text);
        }
      } catch {
        const sel = typeof window !== 'undefined' ? window.getSelection() : null;
        if (sel?.rangeCount) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createTextNode(text));
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
      editorDirtyRef.current = true;
      scheduleToolbarFormatRefresh();
    },
    [currentNote, scheduleToolbarFormatRefresh],
  );

  /** 加粗/斜体/下划线使用浏览器原生命令，支持再次点击取消；再把 b/i 规范为 strong/em 以符合后端与现有逻辑 */
  const applyInlineFormat = useCallback(
    (mode: 'bold' | 'italic' | 'underline') => {
      if (!currentNote) return;
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      if (typeof document === 'undefined') return;
      try {
        if (mode === 'bold') {
          document.execCommand('bold', false);
          normalizeBrowserBoldItalicToBackendTags(el);
        } else if (mode === 'italic') {
          document.execCommand('italic', false);
          normalizeBrowserBoldItalicToBackendTags(el);
        } else {
          document.execCommand('underline', false);
        }
      } catch {
        // ignore
      }
      commitEditorToState();
      scheduleToolbarFormatRefresh();
    },
    [commitEditorToState, currentNote, scheduleToolbarFormatRefresh],
  );

  const applyLineStyle = useCallback(
    (mode: 'heading' | 'paragraph') => {
      if (!currentNote) return;
      if (mode === 'heading') {
        runExec('formatBlock', '<h1>');
        return;
      }
      runExec('formatBlock', '<p>');
    },
    [currentNote, runExec],
  );

  const applyTextAlign = useCallback(
    (align: TextAlignMode) => {
      if (!currentNote) return;
      const map: Record<TextAlignMode, string> = {
        left: 'justifyLeft',
        center: 'justifyCenter',
        right: 'justifyRight',
      };
      runExec(map[align]);
    },
    [currentNote, runExec],
  );

  const applyFontSizeToSelection = useCallback(
    (size: number) => {
      if (!currentNote) return;
      runExec('fontSize', '7');
      const el = editorRef.current;
      if (!el) return;
      const fontElements = el.querySelectorAll('font[size="7"]');
      fontElements.forEach((node) => {
        const span = document.createElement('span');
        span.setAttribute('style', `font-size:${size}px`);
        span.innerHTML = node.innerHTML;
        node.parentNode?.replaceChild(span, node);
      });
      commitEditorToState();
      scheduleToolbarFormatRefresh();
    },
    [commitEditorToState, currentNote, runExec, scheduleToolbarFormatRefresh],
  );

  const applyFontFamilyToSelection = useCallback(
    (family: EditorFontFamily) => {
      if (!currentNote) return;
      runExec('fontName', fontFamilyForExec(family));
    },
    [currentNote, runExec],
  );

  const handleUndo = useCallback(() => {
    if (!currentNote) return;
    runExec('undo');
  }, [currentNote, runExec]);

  const handleRedo = useCallback(() => {
    if (!currentNote) return;
    runExec('redo');
  }, [currentNote, runExec]);

  const getEditorContentOrWarn = useCallback(() => {
    if (!currentNote) {
      showStatus('请先选择或新建一条笔记');
      return null;
    }
    const { plain } = readEditorSnapshot();
    const content = plain.trim();
    if (!content) {
      showStatus('笔记正文为空，无法生成摘要或翻译');
      return null;
    }
    return content;
  }, [currentNote, readEditorSnapshot, showStatus]);

  const performSave = useCallback(async (silent: boolean) => {
    if (!currentNote) return;
    const title = currentNote.title.trim();
    const { plain, rich } = readEditorSnapshot();
    const content = plain.trim();
    if (!title) {
      if (!silent) {
        showStatus('笔记标题不能为空');
        message.warning('笔记标题不能为空');
      }
      return;
    }
    if (!content) {
      if (!silent) {
        showStatus('笔记正文不能为空');
        message.warning('笔记正文不能为空');
      }
      return;
    }
    const categoryIds = currentNote.categoryIds || [];
    const richContent = rich;
    try {
      const noteId = Number(currentNote.id);
      if (Number.isInteger(noteId)) {
        await updateNotebookNote({
          id: noteId,
          title,
          content,
          richContent,
          categoryIds,
          favorite: currentNote.favorite,
        });
      } else {
        await addNotebookNote({
          title,
          content,
          richContent,
          categoryIds,
        });
      }
      const time = new Date().toLocaleString();
      patchNote(currentNote.id, { title, content, richContent, time });
      recordNoteSaveSnapshot(currentNote.id, { title, content, richContent, savedAt: time });
      if (silent) {
        showStatus('已自动保存');
      } else {
        showStatus('笔记保存成功');
        message.success('笔记已保存');
      }
      editorDirtyRef.current = false;
      await reloadNotebookData();
    } catch {
      if (silent) {
        showStatus('自动保存失败，请手动保存');
      } else {
        message.error('保存失败，请稍后重试');
      }
    }
  }, [currentNote, patchNote, readEditorSnapshot, reloadNotebookData, showStatus]);

  const handleSave = useCallback(async () => {
    await performSave(false);
  }, [performSave]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (autoSaveTimerRef.current !== null) {
      window.clearInterval(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    const intervalMs = autoSaveIntervalToMs(settings.autoSaveInterval);
    if (!intervalMs || !currentNote) {
      return undefined;
    }
    autoSaveTimerRef.current = window.setInterval(() => {
      if (!currentNote || autoSaveInFlightRef.current || !editorDirtyRef.current) {
        return;
      }
      autoSaveInFlightRef.current = true;
      void performSave(true).finally(() => {
        autoSaveInFlightRef.current = false;
      });
    }, intervalMs);
    return () => {
      if (autoSaveTimerRef.current !== null) {
        window.clearInterval(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [currentNote, performSave, settings.autoSaveInterval]);

  const handleDelete = useCallback(() => {
    if (!currentNote) {
      showStatus('当前没有可删除的笔记');
      return;
    }
    Modal.confirm({
      title: '删除笔记',
      content: `确定删除「${currentNote.title}」吗？此操作不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        const id = currentNote.id;
        try {
          const noteId = Number(id);
          if (Number.isInteger(noteId)) {
            await deleteNotebookNotes([noteId]);
          }
          setData((d) => ({
            ...d,
            notes: d.notes.filter((n) => n.id !== id),
          }));
          showStatus('笔记删除成功');
          message.success('已删除');
          await reloadNotebookData();
        } catch {
          message.error('删除失败，请稍后重试');
        }
      },
    });
  }, [currentNote, reloadNotebookData, showStatus]);

  const handleCreate = useCallback(async () => {
    const defaultCat =
      settings.defaultCategoryId.trim() === '' ? null : Number(settings.defaultCategoryId);
    const cat: number | null = filterCat === 'all' ? defaultCat : filterCat;
    try {
      const newId = await addNotebookNote({
        title: '新建笔记',
        content: '',
        richContent: '',
        categoryIds: cat === null ? [] : [cat],
      });
      await reloadNotebookData();
      if (newId !== undefined && newId !== null) {
        setSelectedId(String(newId));
      }
      showStatus('已创建一条新笔记');
    } catch {
      message.error('创建失败，请稍后重试');
    }
  }, [filterCat, reloadNotebookData, settings.defaultCategoryId, showStatus]);

  const handleSummarize = useCallback(async () => {
    const content = getEditorContentOrWarn();
    if (!content) return;
    setAiActionLoading(true);
    try {
      try {
        const res = await summarizeNotebookText(content, Number(currentNote?.id) || undefined);
        showAiResultModal('摘要', res?.text || summarizeText(content));
      } catch {
        showAiResultModal('摘要', summarizeText(content));
      }
    } finally {
      setAiActionLoading(false);
    }
  }, [currentNote?.id, getEditorContentOrWarn, showAiResultModal]);

  const handleTranslate = useCallback(async () => {
    const content = getEditorContentOrWarn();
    if (!content) return;
    setAiActionLoading(true);
    try {
      try {
        const res = await translateNotebookText(content, Number(currentNote?.id) || undefined, '简体中文');
        showAiResultModal('翻译', res?.text || '翻译失败');
      } catch {
        const preview = content.length > 200 ? `${content.slice(0, 200)}…` : content;
        showAiResultModal('翻译', `接口不可用，以下为原文预览：\n\n${preview}`);
      }
    } finally {
      setAiActionLoading(false);
    }
  }, [currentNote?.id, getEditorContentOrWarn, showAiResultModal]);

  const handleToggleFavorite = useCallback(async () => {
    if (!currentNote) {
      showStatus('请先选择一条笔记');
      return;
    }
    const next = !currentNote.favorite;
    const noteId = Number(currentNote.id);
    if (Number.isInteger(noteId)) {
      try {
        await updateNotebookNoteFavorite(noteId, next);
        patchNote(currentNote.id, { favorite: next });
        await reloadNotebookData();
        showStatus(next ? '已加入收藏' : '已取消收藏');
        message.success(next ? '已加入收藏' : '已取消收藏');
      } catch {
        message.error('收藏状态同步失败，请稍后重试');
      }
      return;
    }
    patchNote(currentNote.id, { favorite: next });
    showStatus(next ? '已加入收藏' : '已取消收藏');
    message.success(next ? '已加入收藏' : '已取消收藏');
  }, [currentNote, patchNote, reloadNotebookData, showStatus]);

  const handleLogout = useCallback(async () => {
    await logout();
    clearLoginDisplayName();
    setInitialState((s) => ({ ...s, currentToken: undefined }));
    history.replace(APP_LOGIN_PATH);
  }, [setInitialState]);

  const confirmLogout = useCallback(() => {
    Modal.confirm({
      title: '确认退出登录',
      content: '退出后需要重新登录才能继续使用，确定退出吗？',
      okText: '退出登录',
      cancelText: '取消',
      okType: 'danger',
      onOk: () => void handleLogout(),
    });
  }, [handleLogout]);

  const handleClearLocalData = useCallback(() => {
    Modal.confirm({
      title: '清除本地笔记数据',
      content: '将删除浏览器中保存的全部分类与笔记，且无法恢复。是否继续？',
      okText: '清除',
      okType: 'danger',
      onOk: () => {
        localStorage.removeItem('notebook_app_data_v1');
        setData(loadNotebookData());
        message.success('已重置为默认数据');
        setSettingsOpen(false);
      },
    });
  }, []);

  const pathname = location.pathname;
  const userLabel = getDisplayUserName(currentToken);

  const foldable = data.categories.length > CATEGORY_NAV_COLLAPSE_MAX;
  const singleLineStrip = !foldable || (foldable && !categoryNavExpanded);
  let catsToShow = data.categories;
  if (foldable && !categoryNavExpanded) {
    catsToShow = data.categories.slice(0, CATEGORY_NAV_COLLAPSE_MAX);
  }

  const listToggleCollapsed = listCollapsed;
  const notesPanelHidden = listToggleCollapsed;

  return (
    <div className={`nb-note-page nb-theme-${settings.theme} nb-setting-font-${settings.fontScale}`}>
      <div className={`nb-note-app${listCollapsed ? ' list-collapsed' : ''}`}>
        <aside className="sidebar">
          <div className="logo">我的笔记</div>
          <div className="user-card">
            <AutoFitOneLine
              className="user-card-name"
              title={userLabel ? `用户：${userLabel}` : '用户：—'}
              maxFontSize={18}
              minFontSize={18}
            >
              {userLabel ? `用户：${userLabel}` : '用户：—'}
            </AutoFitOneLine>
            <div className="user-card-line">
              <span className="user-card-key">身份：</span>
              <span>普通用户</span>
            </div>
            <div className="user-card-line">
              <span className="user-card-key">状态：</span>
              <span>已登录</span>
            </div>
          </div>

          <div className="nav-title">功能导航</div>
          <div
            className={`nav-item${pathname === '/notebook/note' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/note')}
            onKeyDown={(e) => e.key === 'Enter' && history.push('/notebook/note')}
            role="button"
            tabIndex={0}
          >
            笔记管理
          </div>
          <div
            className={`nav-item${pathname === '/notebook/category' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/category')}
            role="button"
            tabIndex={0}
          >
            分类管理
          </div>
          <div
            className={`nav-item${pathname === '/notebook/statistics' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/statistics')}
            role="button"
            tabIndex={0}
          >
            数据统计
          </div>
          <div
            className={`nav-item${pathname === '/notebook/favorites' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/favorites')}
            role="button"
            tabIndex={0}
          >
            收藏笔记
          </div>
          <div
            className={`nav-item${pathname === '/notebook/recent' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/recent')}
            role="button"
            tabIndex={0}
          >
            最近编辑
          </div>
          <div
            className={`nav-item${pathname === '/notebook/profile' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/profile')}
            role="button"
            tabIndex={0}
          >
            个人中心
          </div>

          <div className="nav-title">系统操作</div>
          <div
            className="nav-item"
            onClick={() => setSettingsOpen(true)}
            role="button"
            tabIndex={0}
          >
            系统设置
          </div>
          <div className="nav-item" onClick={confirmLogout} role="button" tabIndex={0}>
            退出登录
          </div>
        </aside>

        <div className="list-area">
          <section
            className="notes-panel"
            id="notesPanel"
            aria-label="笔记列表"
            aria-hidden={notesPanelHidden}
          >
            <div className="search-box">
              <input
                type="search"
                placeholder="搜索笔记标题或内容"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="category-nav">
              <div className="category-nav-row">
                <div
                  className={`category-nav-pills${singleLineStrip ? ' category-nav-pills--single-line' : ''}`}
                  role="tablist"
                  aria-label="笔记分类筛选"
                >
                  <button
                    type="button"
                    className={`cat-pill${filterCat === 'all' ? ' active' : ''}`}
                    role="tab"
                    aria-selected={filterCat === 'all'}
                    onClick={() => setFilterCat('all')}
                  >
                    全部笔记
                  </button>
                  {catsToShow.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`cat-pill${filterCat === cat.id ? ' active' : ''}`}
                      role="tab"
                      aria-selected={filterCat === cat.id}
                      onClick={() => setFilterCat(cat.id)}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
                {foldable ? (
                  <button
                    type="button"
                    className="category-nav-toggle"
                    aria-expanded={categoryNavExpanded}
                    aria-label={categoryNavExpanded ? '收起更多分类' : '展开更多分类'}
                    onClick={() => setCategoryNavExpanded((v) => !v)}
                  >
                    {categoryNavExpanded ? '▲' : '▼'}
                  </button>
                ) : null}
              </div>
            </div>

            <div>
              <div
                className="note-item new-note"
                onClick={handleCreate}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              >
                <h4>＋ 新建笔记</h4>
                <p>点击创建一条空白笔记</p>
                <div className="note-meta">
                  {filterCat === 'all'
                    ? '在「全部笔记」下新建将记为未分类'
                    : `将归入「${categoryNameById(data.categories, filterCat)}」`}
                </div>
              </div>

              {filteredNotes.map((note) => (
                <div
                  key={note.id}
                  className={`note-item${note.id === selectedId ? ' active' : ''}`}
                  onClick={() => setSelectedId(note.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && setSelectedId(note.id)}
                >
                  <h4>
                    {note.favorite ? '★ ' : ''}
                    {note.title}
                  </h4>
                  <p>
                    {note.content.length > 0 ? `${note.content.slice(0, 42)}…` : '（暂无正文）'}
                  </p>
                  <div className="note-meta">
                    最近修改：{note.time} · {categoryNamesByIds(data.categories, note.categoryIds)}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="list-toggle-shell">
            <button
              type="button"
              className="list-toggle"
              aria-controls="notesPanel"
              aria-expanded={!listToggleCollapsed}
              title={listToggleCollapsed ? '展开笔记列表' : '收起笔记列表'}
              onClick={() => {
                setListCollapsed((c) => !c);
              }}
            >
              <span className="list-toggle-icon" aria-hidden>
                {listToggleCollapsed ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" focusable="false">
                    <path
                      d="M10 6l6 6-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" focusable="false">
                    <path
                      d="M14 6l-6 6 6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
            </button>
          </div>
        </div>

        <main className="content-panel">
          <div className="topbar">
            <div className="title-group">
              <h1>笔记管理</h1>
              {aiActionLoading ? (
                <Spin size="small" aria-label="AI 处理中" />
              ) : null}
            </div>
            {currentNote ? (
              <div className="action-group">
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleSummarize}
                  disabled={aiActionLoading}
                >
                  摘要
                </button>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={handleTranslate}
                  disabled={aiActionLoading}
                >
                  翻译
                </button>
                <button type="button" className="btn secondary" onClick={handleToggleFavorite}>
                  收藏
                </button>
                <button type="button" className="btn secondary" onClick={handleDelete}>
                  删除
                </button>
                <button type="button" className="btn" onClick={handleSave}>
                  保存笔记
                </button>
              </div>
            ) : null}
          </div>

          {currentNote ? (
            <div className="editor">
              <input
                className="editor-title"
                value={currentNote.title}
                placeholder="请输入笔记标题"
                onChange={(e) => patchNote(currentNote.id, { title: e.target.value })}
              />
              <div className="editor-meta">
                {`最近修改：${currentNote.time} · 分类：${categoryNamesByIds(data.categories, currentNote.categoryIds)}${currentNote.favorite ? ' · 已收藏' : ''}`}
              </div>
            <div className="editor-toolbar" aria-label="编辑工具栏">
              <button
                type="button"
                className="nb-toolbar-btn"
                title="撤销"
                onClick={handleUndo}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!currentNote || !toolbarFormat.canUndo}
              >
                ↶
              </button>
              <button
                type="button"
                className="nb-toolbar-btn"
                title="重做"
                onClick={handleRedo}
                onMouseDown={(e) => e.preventDefault()}
                disabled={!currentNote || !toolbarFormat.canRedo}
              >
                ↷
              </button>
              <span className="toolbar-divider" />
              <select
                className="toolbar-select"
                value={editorFontFamily}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const v = e.target.value as EditorFontFamily;
                  setEditorFontFamily(v);
                  applyFontFamilyToSelection(v);
                }}
                disabled={!currentNote}
                aria-label="字体"
              >
                <option value="yahei">微软雅黑</option>
                <option value="song">宋体</option>
                <option value="hei">黑体</option>
                <option value="kai">楷体</option>
                <option value="mono">等宽字体</option>
              </select>
              <select
                className="toolbar-select toolbar-select-size"
                value={String(editorFontSize)}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (!Number.isFinite(n)) return;
                  setEditorFontSize(n);
                  applyFontSizeToSelection(n);
                }}
                disabled={!currentNote}
                aria-label="字号"
                title="调整选区字号"
              >
                {!FONT_SIZE_SUGGESTIONS.includes(editorFontSize) && (
                  <option value={String(editorFontSize)}>{editorFontSize}</option>
                )}
                {FONT_SIZE_SUGGESTIONS.map((s) => (
                  <option key={s} value={String(s)}>
                    {s}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.bold ? ' is-active' : ''}`}
                title="加粗"
                aria-pressed={toolbarFormat.bold}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyInlineFormat('bold')}
                disabled={!currentNote}
              >
                B
              </button>
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.italic ? ' is-active' : ''}`}
                title="斜体"
                aria-pressed={toolbarFormat.italic}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyInlineFormat('italic')}
                disabled={!currentNote}
              >
                I
              </button>
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.underline ? ' is-active' : ''}`}
                title="下划线"
                aria-pressed={toolbarFormat.underline}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyInlineFormat('underline')}
                disabled={!currentNote}
              >
                U
              </button>
              <span className="toolbar-divider" />
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.isHeading ? ' is-active' : ''}`}
                title="标题"
                aria-pressed={toolbarFormat.isHeading}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyLineStyle('heading')}
                disabled={!currentNote}
              >
                标题
              </button>
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.isBody ? ' is-active' : ''}`}
                title="正文"
                aria-pressed={toolbarFormat.isBody}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyLineStyle('paragraph')}
                disabled={!currentNote}
              >
                正文
              </button>
              <span className="toolbar-divider" />
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.align === 'left' ? ' is-active' : ''}`}
                title="左对齐"
                aria-pressed={toolbarFormat.align === 'left'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextAlign('left')}
                disabled={!currentNote}
              >
                左对齐
              </button>
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.align === 'center' ? ' is-active' : ''}`}
                title="居中"
                aria-pressed={toolbarFormat.align === 'center'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextAlign('center')}
                disabled={!currentNote}
              >
                居中
              </button>
              <button
                type="button"
                className={`nb-toolbar-btn${toolbarFormat.align === 'right' ? ' is-active' : ''}`}
                title="右对齐"
                aria-pressed={toolbarFormat.align === 'right'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyTextAlign('right')}
                disabled={!currentNote}
              >
                右对齐
              </button>
            </div>
            <div
              ref={editorRef}
              className="nb-rich-editor"
              contentEditable={Boolean(currentNote)}
              suppressContentEditableWarning
              data-placeholder="请输入笔记内容"
              onPaste={handleEditorPaste}
              onInput={handleEditorInput}
              onMouseUp={scheduleToolbarFormatRefresh}
              onKeyUp={scheduleToolbarFormatRefresh}
              onBlur={() => {
                if (!currentNote) return;
                const { plain, rich } = readEditorSnapshot();
                editorDirtyRef.current = false;
                patchNote(currentNote.id, { content: plain, richContent: rich });
              }}
              style={{
                minHeight: 360,
                padding: 12,
                lineHeight: 1.7,
                outline: 'none',
                border: '1px solid #e8ded4',
                borderRadius: 8,
                background: '#ffffff',
                fontFamily: fontFamilyCssName(editorFontFamily),
                fontSize: `${editorBaseFontPx}px`,
              }}
            />
            {statusText ? <div className="nb-status">{statusText}</div> : null}
            </div>
          ) : null}
        </main>
      </div>

      <Modal
        title="系统设置"
        open={settingsOpen}
        wrapClassName={`nb-setting-modal-font-${settings.fontScale} nb-theme-modal-${settings.theme}`}
        onCancel={() => setSettingsOpen(false)}
        footer={null}
        destroyOnClose
      >
        <div className="nb-settings-form">
          <div className="nb-settings-group">
            <div className="nb-settings-title">外观</div>
            <label className="nb-settings-label">
              主题
              <select
                value={settings.theme}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, theme: e.target.value as NoteSettings['theme'] }))
                }
              >
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </label>
            <label className="nb-settings-label">
              字体大小
              <select
                value={settings.fontScale}
                onChange={(e) =>
                  setSettings(
                    (s) => ({ ...s, fontScale: e.target.value as NoteSettings['fontScale'] }),
                  )
                }
              >
                <option value="small">小</option>
                <option value="medium">中</option>
                <option value="large">大</option>
              </select>
            </label>
          </div>

          <div className="nb-settings-group">
            <div className="nb-settings-title">语言</div>
            <label className="nb-settings-label">
              界面语言
              <select
                value={settings.language}
                onChange={(e) =>
                  setSettings(
                    (s) => ({ ...s, language: e.target.value as NoteSettings['language'] }),
                  )
                }
              >
                <option value="zh-CN">简体中文</option>
              </select>
            </label>
          </div>

          <div className="nb-settings-group">
            <div className="nb-settings-title">笔记</div>
            <label className="nb-settings-label">
              新笔记默认分类
              <select
                value={settings.defaultCategoryId}
                onChange={(e) => setSettings((s) => ({ ...s, defaultCategoryId: e.target.value }))}
              >
                <option value="">未分类</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="nb-settings-label">
              列表默认排序
              <select
                value={settings.defaultSort}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, defaultSort: e.target.value as NoteSort }))
                }
              >
                <option value="recent">最近编辑优先</option>
                <option value="titleAsc">标题升序</option>
                <option value="titleDesc">标题降序</option>
              </select>
            </label>
            <label className="nb-settings-label">
              自动保存间隔
              <select
                value={settings.autoSaveInterval}
                onChange={(e) =>
                  setSettings(
                    (s) => ({ ...s, autoSaveInterval: e.target.value as AutoSaveInterval }),
                  )
                }
              >
                <option value="off">关闭</option>
                <option value="30s">30 秒</option>
                <option value="1m">1 分钟</option>
                <option value="5m">5 分钟</option>
              </select>
            </label>
          </div>

          <div className="nb-settings-actions">
            <button type="button" className="btn secondary" onClick={() => setSettingsOpen(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setSettingsOpen(false);
                message.success('设置已保存');
              }}
            >
              保存设置
            </button>
            <button
              type="button"
              className="btn"
              style={{ background: '#dc2626' }}
              onClick={handleClearLocalData}
            >
              清除数据
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        title={aiResultModal.title}
        open={aiResultModal.open}
        wrapClassName={`nb-theme-modal-${settings.theme}`}
        onCancel={() => setAiResultModal((m) => ({ ...m, open: false }))}
        footer={
          <Button type="primary" onClick={() => setAiResultModal((m) => ({ ...m, open: false }))}>
            关闭
          </Button>
        }
        width={640}
        destroyOnClose
      >
        <div
          style={{
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            maxHeight: '60vh',
            overflow: 'auto',
            lineHeight: 1.6,
          }}
        >
          {aiResultModal.text}
        </div>
      </Modal>
    </div>
  );
};

export default NotePage;
