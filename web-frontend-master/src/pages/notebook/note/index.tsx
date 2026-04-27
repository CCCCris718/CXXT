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

/**
 * 笔记主页面：左侧为列表导航，右侧为富文本编辑区域。
 * - 远端数据通过 notebook 相关接口获取与持久化；
 * - 本地缓存由 storage 模块统一管理（localStorage）。
 */

const CATEGORY_NAV_COLLAPSE_MAX = 2;
const NOTE_SETTINGS_KEY = 'notebook_note_settings_v1';
const FONT_SIZE_SUGGESTIONS = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 48];
/** 编辑器基础字号，仅影响默认展示，不与“选区字号”联动。 */
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
  // 设置读取采取“默认值 + 增量覆盖”策略，保证历史版本字段缺失时可平滑兼容。
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
  // 自动保存仅在固定档位下生效，关闭时返回 null 以便上层直接短路。
  if (interval === '30s') return 30_000;
  if (interval === '1m') return 60_000;
  if (interval === '5m') return 300_000;
  return null;
}

function summarizeText(content: string) {
  // 本地兜底摘要：优先抽取首句，再控制最大展示长度。
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
  // 统一时间展示入口：非法时间字符串直接透传，避免展示空值。
  if (!time) return new Date().toLocaleString();
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? time : d.toLocaleString();
}

function escapeHtmlText(text: string) {
  // 仅用于纯文本回退渲染，避免插入未转义字符导致结构污染。
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function plainTextToFallbackHtml(plain: string) {
  // 当 richContent 缺失时，将纯文本安全转换为段落结构。
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
  // 与后端清洗策略保持一致，前端仅保留安全 HTML 片段。
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
 * 浏览器 execCommand 常生成 <b>/<i> 标签，服务端标准为 <strong>/<em>。
 * 这里逐节点替换，避免整段 innerHTML 重写导致选区与事件状态丢失。
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

/** 编辑器工具栏状态，始终依据当前选区实时计算。 */
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

/**
 * 以下工具函数用于推导工具栏状态：
 * - 选区是否位于编辑器内部；
 * - 当前块级标签类型；
 * - 行内样式与对齐方式。
 */

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
  // 无法访问 DOM 或编辑器未挂载时，返回默认态以避免 UI 误导。
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

/**
 * NotePage 负责：
 * - 笔记列表与当前编辑项状态管理；
 * - 编辑器内容同步与格式工具栏联动；
 * - 自动保存与后端数据刷新。
 */

const NotePage: React.FC = () => {
  /** 全局登录态与路由上下文。 */
  const { initialState, setInitialState } = useModel('@@initialState');
  const location = useLocation();
  const currentToken = initialState?.currentToken;

  /** 页面核心业务状态：列表、筛选、选中项与界面开关。 */
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
  /** 编辑器相关引用：用于持有 DOM、脏标记和定时器句柄。 */
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
    // 使用 RAF 合并高频事件，降低 selectionchange 带来的重复计算开销。
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
    // 通过 requestId 只保留最新请求结果，避免慢请求覆盖新状态。
    const requestId = reloadRequestIdRef.current + 1;
    reloadRequestIdRef.current = requestId;
    try {
      const [categories, notePage] = await Promise.all([
        listNotebookCategories(),
        listNotebookNotes({ current: 1, pageSize: 500 }),
      ]);
      if (requestId !== reloadRequestIdRef.current) {
        return;
      }
      /**
       * 列表接口不稳定返回 richContent，需与本地缓存做合并。
       * 同时，后端 plainText 与前端 innerText 存在实现差异，不能用“正文相同”作为 rich 保留条件。
       */
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
    // 初次进入页面时拉取一次远端数据，并与本地缓存合并。
    void reloadNotebookData();
  }, [reloadNotebookData]);

  useEffect(() => {
    // 监听全局选区变更，驱动工具栏状态更新。
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
    // 任意数据变更后写回本地缓存，保证刷新后可恢复。
    saveNotebookData(data);
  }, [data]);

  useEffect(() => {
    // 设置项单独持久化，避免与业务数据互相覆盖。
    localStorage.setItem(NOTE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    // 支持通过 URL 参数执行一次性动作（如打开设置、指定分类），处理后清理参数。
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
    // 按“分类 -> 关键词 -> 排序”顺序处理，确保筛选逻辑可预测。
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
    // 保证选中项与过滤结果一致，不存在时自动回退到首条可见笔记。
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
    // 切换当前笔记后刷新工具栏状态，防止沿用上一个笔记的选区态。
    if (!currentNote) {
      setToolbarFormat(TOOLBAR_FORMAT_INITIAL);
      return;
    }
    scheduleToolbarFormatRefresh();
  }, [currentNote, scheduleToolbarFormatRefresh]);

  const patchNote = useCallback((id: string, patch: Partial<NotebookNote>) => {
    // 统一的单条笔记补丁入口，减少重复 map 逻辑。
    setData((d) => ({
      ...d,
      notes: d.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }, []);

  /**
   * 列表接口通常不返回富文本内容。
   * 当本地 richContent 缺失时，按需补拉单条详情，避免编辑器退化为纯文本模式。
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
        // 详情拉取失败时保持纯文本可用，避免阻断主流程。
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, currentNote, patchNote]);

  const showStatus = useCallback((text: string) => {
    // 轻量状态提示：统一展示并自动清空，减少重复 message 弹窗。
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
    // 统一读取编辑器快照，确保 plain/rich 来源一致。
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
    // 仅在内容变更时写入状态，避免无意义 setState。
    if (!currentNote) return;
    const { plain, rich } = readEditorSnapshot();
    editorDirtyRef.current = true;
    if (plain === currentNote.content && (rich || '') === (currentNote.richContent || '')) {
      return;
    }
    patchNote(currentNote.id, { content: plain, richContent: rich });
  }, [currentNote, patchNote, readEditorSnapshot]);

  const runExec = useCallback((command: string, value?: string) => {
    // 对 execCommand 做统一封装，便于集中处理选区和工具栏同步。
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
    // 受控回填：仅在未编辑脏态时才将状态写回 DOM，避免覆盖用户输入。
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
    // DOM 回填后刷新工具栏，确保高亮状态与当前选区一致。
    scheduleToolbarFormatRefresh();
  }, [selectedId, activeRichContent, scheduleToolbarFormatRefresh]);

  const handleEditorInput = useCallback(() => {
    // 输入时只标记脏态，不立即落库；保存交由手动/自动保存流程处理。
    if (!currentNote) return;
    editorDirtyRef.current = true;
    scheduleToolbarFormatRefresh();
  }, [currentNote, scheduleToolbarFormatRefresh]);

  /** 粘贴统一降级为纯文本，避免引入网页或 Office 的冗余样式。 */
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

  /**
   * 行内格式（加粗/斜体/下划线）使用原生命令执行。
   * 执行后补做标签规范化，保证保存结构与后端约定一致。
   */
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
      // 块级样式统一映射到 formatBlock，避免与行内样式冲突。
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
      // 对齐命令使用显式映射，便于维护和审计。
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
      // 兼容策略：先触发浏览器字号命令，再替换为 px 内联样式。
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
    // AI 功能统一读取正文并执行空值校验。
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
    // 保存前统一做标题/正文校验，避免产生空内容笔记。
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
        // 已存在笔记走更新接口。
        await updateNotebookNote({
          id: noteId,
          title,
          content,
          richContent,
          categoryIds,
          favorite: currentNote.favorite,
        });
      } else {
        // 本地临时项在服务端落库时走创建接口。
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
    // 自动保存在“有选中笔记 + 已开启间隔 + 当前内容已变更”三条件下生效。
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
    // 删除属于高风险操作，必须经由确认弹窗触发。
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
    // 新建笔记默认继承“当前筛选分类”或“系统默认分类”。
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
    // 摘要优先走服务端接口，失败时回退本地摘要算法。
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
    // 翻译失败时展示原文片段，避免反馈中断。
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
    // 已落库笔记同步后端；本地临时笔记仅更新前端状态。
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
    // 退出流程：清理会话态并跳转登录页。
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
    // 仅清理本地缓存，不删除服务端数据。
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
        {/* 左侧导航区：用户信息、页面跳转与系统操作入口。 */}
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

        {/* 中部列表区：搜索、分类筛选与笔记卡片列表。 */}
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
          {/* 列表显隐切换按钮，用于聚焦右侧编辑区域。 */}
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

        {/* 右侧正文区：标题、工具栏、编辑器与保存状态。 */}
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
              {/* 标题输入框：仅更新本地状态，保存由显式动作触发。 */}
              <input
                className="editor-title"
                value={currentNote.title}
                placeholder="请输入笔记标题"
                onChange={(e) => patchNote(currentNote.id, { title: e.target.value })}
              />
              <div className="editor-meta">
                {`最近修改：${currentNote.time} · 分类：${categoryNamesByIds(data.categories, currentNote.categoryIds)}${currentNote.favorite ? ' · 已收藏' : ''}`}
              </div>
            {/* 富文本工具栏：命令统一经由封装函数执行。 */}
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
            {/* contentEditable 编辑区：负责输入、粘贴与失焦同步。 */}
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
