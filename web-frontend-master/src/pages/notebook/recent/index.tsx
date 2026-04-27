import { Modal, message } from 'antd';
import DOMPurify from 'dompurify';
import React, { useEffect, useMemo, useState } from 'react';
import { getNotebookNote, updateNotebookNote } from '@/services/api/notebook';
import NotebookWorkspace from '../components/NotebookWorkspace';
import './index.less';
import {
  categoryNamesByIds,
  loadNotebookData,
  loadNoteSaveHistories,
  recordNoteSaveSnapshot,
  saveNotebookData,
} from '../note/storage';

/**
 * 最近编辑页职责：
 * - 基于本地保存快照展示最近编辑轨迹；
 * - 提供最近两次保存差异摘要与内容高亮；
 * - 支持将笔记恢复到上一次保存版本。
 */

function sanitizeRichHtml(html: string) {
  // 富文本预览前进行清洗，避免历史内容中的潜在不安全标签直接渲染。
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function splitSegments(text: string) {
  // 以“句段 + 换行标记”为最小粒度拆分，便于差异高亮展示。
  const lines = text.split('\n');
  const parts: string[] = [];
  lines.forEach((line, lineIndex) => {
    const units = line.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [line];
    units
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((u) => parts.push(u));
    if (lineIndex !== lines.length - 1) {
      parts.push('\n');
    }
  });
  return parts;
}

type DiffTokenType = 'equal' | 'add' | 'remove';
type DiffToken = { type: DiffTokenType; text: string };

function buildDiffTokens(previousText: string, currentText: string): DiffToken[] {
  // 使用 LCS 动态规划生成最小编辑可读序列（新增/删除/不变）。
  const a = splitSegments(previousText);
  const b = splitSegments(currentText);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => Array<number>(m + 1).fill(0));

  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const tokens: DiffToken[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      tokens.push({ type: 'equal', text: b[j] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      tokens.push({ type: 'remove', text: a[i] });
      i += 1;
    } else {
      tokens.push({ type: 'add', text: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    tokens.push({ type: 'remove', text: a[i] });
    i += 1;
  }
  while (j < m) {
    tokens.push({ type: 'add', text: b[j] });
    j += 1;
  }

  return tokens;
}

function getSaveDiffSummary(
  noteId: string,
  histories: ReturnType<typeof loadNoteSaveHistories>,
) {
  // 归纳最近两次快照差异，用于面板摘要文案。
  const history = histories[noteId];
  if (!history) {
    return {
      status: 'none' as const,
      titleChanged: false,
      formatChanged: false,
      added: [] as string[],
      removed: [] as string[],
      fromTime: '',
      toTime: '',
      hasDiff: false,
    };
  }

  const previous = history.previous;
  const current = history.current;
  if (!previous) {
    return {
      status: 'single' as const,
      titleChanged: false,
      formatChanged: false,
      added: splitSegments(current.content).slice(0, 3),
      removed: [] as string[],
      fromTime: '',
      toTime: current.savedAt,
      hasDiff: true,
    };
  }

  const prevSegments = splitSegments(previous.content);
  const currSegments = splitSegments(current.content);
  const prevSet = new Set(prevSegments);
  const currSet = new Set(currSegments);
  const added = currSegments.filter((x) => !prevSet.has(x)).slice(0, 3);
  const removed = prevSegments.filter((x) => !currSet.has(x)).slice(0, 3);

  const titleChanged = previous.title !== current.title;
  const formatChanged = (previous.richContent || '') !== (current.richContent || '');
  const hasDiff = titleChanged || formatChanged || added.length > 0 || removed.length > 0;
  return {
    status: hasDiff ? ('changed' as const) : ('same' as const),
    titleChanged,
    formatChanged,
    added,
    removed,
    fromTime: previous.savedAt,
    toTime: current.savedAt,
    hasDiff,
  };
}

function getEmptyDiffText(status: ReturnType<typeof getSaveDiffSummary>['status'] | undefined): string {
  // 按状态返回可直接展示的“无差异原因”文本，避免空面板。
  if (status === 'none') return '暂无本地保存历史。请先在“笔记管理”中保存一次。';
  if (status === 'single') return '目前只有一次保存记录。再次修改并保存后，才会生成两次保存差异。';
  if (status === 'same') return '最近两次保存内容一致，暂无可展示差异。';
  return '暂无可对比差异。';
}

const RecentPage: React.FC = () => {
  // 首屏从本地缓存恢复，提升页面可用性与加载稳定性。
  const [data, setData] = useState(() => loadNotebookData());
  const [saveHistories, setSaveHistories] = useState(() => loadNoteSaveHistories());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    // 页面挂载时同步一次本地缓存快照，避免跨页后数据显示滞后。
    setData(loadNotebookData());
    setSaveHistories(loadNoteSaveHistories());
  }, []);

  const recents = useMemo(() => {
    // 最近编辑按“时间倒序 + 关键词过滤”生成。
    const kw = search.trim().toLowerCase();
    return data.notes
      .slice()
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
      .filter((n) => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw));
  }, [data.notes, search]);

  const current = selectedId
    ? recents.find((n) => n.id === selectedId)
    : recents.length
      ? recents[0]
      : undefined;

  useEffect(() => {
    // 列表数据可能不含 richContent，按需补拉详情以提升预览质量。
    if (!current) return;
    if (String(current.richContent || '').trim() !== '') return;
    const noteId = Number(current.id);
    if (!Number.isInteger(noteId)) return;

    let cancelled = false;
    void (async () => {
      try {
        const detail = await getNotebookNote({ id: noteId });
        if (cancelled || typeof detail?.richContent !== 'string' || detail.richContent.trim() === '') return;
        setData((prev) => {
          const nextData = {
            ...prev,
            notes: prev.notes.map((n) =>
              n.id === current.id
                ? { ...n, content: detail.content ?? n.content, richContent: detail.richContent }
                : n,
            ),
          };
          saveNotebookData(nextData);
          return nextData;
        });
      } catch {
        // 离线或详情接口失败时，保留纯文本预览。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [current]);

  const diff = current ? getSaveDiffSummary(current.id, saveHistories) : undefined;
  const canRestorePrevious = Boolean(current && saveHistories[current.id]?.previous);
  const diffTokens = useMemo(() => {
    // 若不存在历史基线，则将当前正文作为“等价内容”直接展示。
    if (!current) return [] as DiffToken[];
    const history = saveHistories[current.id];
    if (!history?.previous) return [{ type: 'equal', text: current.content || '（暂无正文）' }];
    return buildDiffTokens(history.previous.content, history.current.content);
  }, [current, saveHistories]);

  const handleRestorePrevious = () => {
    // 恢复流程：先同步后端，再刷新本地缓存与历史快照。
    if (!current) {
      message.warning('请先选择一条笔记');
      return;
    }
    const history = saveHistories[current.id];
    if (!history?.previous) {
      message.warning('暂无可恢复的上一次保存版本');
      return;
    }
    const previous = history.previous;
    Modal.confirm({
      title: '恢复到上一次保存',
      content: `将「${current.title}」恢复到 ${previous.savedAt} 的内容，是否继续？`,
      okText: '恢复',
      cancelText: '取消',
      onOk: async () => {
        const noteId = Number(current.id);
        if (!Number.isInteger(noteId)) {
          message.warning('当前笔记尚未同步到后端，无法完整恢复');
          return;
        }
        const now = new Date().toLocaleString();
        const restoredTitle = previous.title || current.title;
        const restoredContent = previous.content || '';
        const restoredRichContent = previous.richContent || '';
        try {
          await updateNotebookNote({
            id: noteId,
            title: restoredTitle,
            content: restoredContent,
            richContent: restoredRichContent,
            categoryIds: current.categoryIds,
            favorite: current.favorite,
          });
        } catch {
          message.error('恢复失败，后端同步未完成');
          throw new Error('Restore note failed');
        }
        const nextData = {
          ...data,
          notes: data.notes.map((n) =>
            n.id === current.id
              ? {
                  ...n,
                  title: restoredTitle,
                  content: restoredContent,
                  richContent: restoredRichContent,
                  time: now,
                }
              : n,
          ),
        };
        setData(nextData);
        saveNotebookData(nextData);
        recordNoteSaveSnapshot(current.id, {
          title: restoredTitle,
          content: restoredContent,
          richContent: restoredRichContent,
          savedAt: now,
        });
        setSaveHistories(loadNoteSaveHistories());
        message.success('已恢复到上一次保存版本');
      },
    });
  };

  // 左侧中栏：最近编辑列表及搜索入口。
  const middle = (
    <>
      <div className="nb-ws-panel">
        <input
          className="nb-ws-search"
          placeholder="搜索最近编辑"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {recents.map((n) => (
        <div
          key={n.id}
          className={`nb-ws-item${current?.id === n.id ? ' active' : ''}`}
          onClick={() => setSelectedId(n.id)}
        >
          <div>{n.title}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{n.time}</div>
        </div>
      ))}
      {!recents.length ? <div style={{ color: '#9ca3af' }}>暂无最近编辑记录</div> : null}
    </>
  );

  return (
    <NotebookWorkspace middle={middle}>
      <h1 className="nb-ws-title">最近编辑</h1>
      <div className="nb-ws-card">
        {!current ? (
          <div style={{ color: '#9ca3af' }}>暂无笔记</div>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontWeight: 800 }}>{current.title}</h2>
            <div style={{ color: '#6b7280', marginBottom: 12 }}>
              最近修改：{current.time} · 分类：{categoryNamesByIds(data.categories, current.categoryIds)}
            </div>
            <div
              className="nb-note-preview-box"
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 14,
                padding: 14,
                lineHeight: 1.8,
                minHeight: 80,
              }}
            >
              {String(current.richContent || '').trim() !== '' ? (
                <div
                  className="nb-note-rich-preview"
                  // 与笔记管理同源：展示已保存的富文本
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(current.richContent || '') }}
                />
              ) : (
                <div className="nb-note-plain-preview">
                  {diffTokens.map((token, idx) => {
                    const isNewLine = token.text === '\n';
                    if (isNewLine) {
                      return <br key={`br_${idx}`} />;
                    }
                    if (token.type === 'add') {
                      return (
                        <span
                          key={`${token.type}_${idx}`}
                          style={{ background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '0 2px' }}
                        >
                          {token.text}
                        </span>
                      );
                    }
                    if (token.type === 'remove') {
                      return (
                        <span
                          key={`${token.type}_${idx}`}
                          style={{
                            background: '#fee2e2',
                            color: '#b91c1c',
                            textDecoration: 'line-through',
                            borderRadius: 4,
                            padding: '0 2px',
                            marginRight: 2,
                          }}
                        >
                          {token.text}
                        </span>
                      );
                    }
                    return <span key={`${token.type}_${idx}`}>{token.text}</span>;
                  })}
                </div>
              )}
            </div>
            <div
              className="nb-ws-panel nb-note-diff-panel"
              style={{ marginTop: 14, position: 'relative', paddingRight: 120 }}
            >
              <div
                style={{
                  fontWeight: 600,
                  marginBottom: 8,
                }}
              >
                <span>最近两次保存差异</span>
              </div>
              <button
                type="button"
                className="nb-ws-filter-btn"
                onClick={handleRestorePrevious}
                disabled={!canRestorePrevious}
                style={{
                  position: 'absolute',
                  right: 24,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  height: 40,
                  minWidth: 82,
                  padding: '0 18px',
                  fontSize: 17,
                  fontWeight: 600,
                  cursor: canRestorePrevious ? 'pointer' : 'not-allowed',
                  opacity: canRestorePrevious ? 1 : 0.45,
                }}
              >
                恢复
              </button>
              {!diff?.hasDiff ? (
                <div style={{ color: '#9ca3af' }}>{getEmptyDiffText(diff?.status)}</div>
              ) : (
                <>
                  <div style={{ color: '#64748b', fontSize: 12, marginBottom: 8 }}>
                    对比区间：{diff.fromTime || '首次保存'} → {diff.toTime}
                  </div>
                  {diff.titleChanged ? (
                    <div style={{ color: '#0f172a', marginBottom: 6 }}>标题发生了修改</div>
                  ) : null}
                  {diff.formatChanged ? (
                    <div style={{ color: '#0f172a', marginBottom: 6 }}>正文格式发生了修改</div>
                  ) : null}
                  <div style={{ marginBottom: 6 }}>
                    <span className="nb-note-diff-added" style={{ color: '#16a34a', fontWeight: 600 }}>
                      新增了：
                    </span>
                    <span style={{ color: '#334155' }}>
                      {diff.added.length ? diff.added.join('；') : '（无）'}
                    </span>
                  </div>
                  <div>
                    <span className="nb-note-diff-removed" style={{ color: '#dc2626', fontWeight: 600 }}>
                      删除了：
                    </span>
                    <span style={{ color: '#334155' }}>
                      {diff.removed.length ? diff.removed.join('；') : '（无）'}
                    </span>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </NotebookWorkspace>
  );
};

export default RecentPage;
