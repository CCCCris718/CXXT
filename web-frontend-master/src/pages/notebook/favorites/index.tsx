import { message } from 'antd';
import DOMPurify from 'dompurify';
import React, { useEffect, useMemo, useState } from 'react';
import {
  getNotebookNote,
  listNotebookCategories,
  listNotebookNotes,
  updateNotebookNoteFavorite,
} from '@/services/api/notebook';
import NotebookWorkspace from '../components/NotebookWorkspace';
import './index.less';
import {
  categoryNamesByIds,
  loadNotebookData,
  mergeNoteFavorite,
  saveNotebookData,
  type NotebookData,
} from '../note/storage';

/**
 * 收藏页职责：
 * - 展示当前用户收藏笔记；
 * - 支持按关键词筛选与取消收藏；
 * - 与本地缓存保持同步，保证跨页状态一致。
 */

function sanitizeRichHtml(html: string) {
  // 富文本预览前进行清洗，避免直接渲染不可信标签。
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

const FavoritesPage: React.FC = () => {
  // 先加载本地缓存，随后以远端数据进行覆盖更新。
  const [data, setData] = useState<NotebookData>(() => loadNotebookData());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const reloadData = async () => {
      // 采用“本地先展示 + 远端再校准”的加载策略。
      const localData = loadNotebookData();
      setData(localData);
      try {
        const [categories, notePage] = await Promise.all([
          listNotebookCategories(),
          listNotebookNotes({ current: 1, pageSize: 500 }),
        ]);
        if (cancelled) return;
        const prevById = new Map(localData.notes.map((n) => [n.id, n]));
        const nextData: NotebookData = {
          categories: (categories || []).flatMap((c) =>
            typeof c.id === 'number'
              ? [{ id: c.id, name: c.name || '未命名分类', createdAt: c.createdAt, updatedAt: c.updatedAt }]
              : [],
          ),
          notes: (notePage?.list || []).map((n) => {
            const id = String(n.id);
            const prevNote = prevById.get(id);
            return {
              id,
              title: n.title || '未命名笔记',
              content: n.content || '',
              richContent: n.richContent || prevNote?.richContent,
              time: n.updatedAt ? new Date(n.updatedAt).toLocaleString() : new Date().toLocaleString(),
              categoryIds: (n.categories || [])
                .map((c) => c.id)
                .filter((id): id is number => typeof id === 'number'),
              favorite: mergeNoteFavorite(n.favorite, prevNote?.favorite),
            };
          }),
        };
        setData(nextData);
        saveNotebookData(nextData);
      } catch {
        // 远端失败时保留本地数据，页面仍可正常使用。
      }
    };
    void reloadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const favoriteNotes = useMemo(() => {
    // 收藏列表按最近更新时间倒序，便于优先查看最新内容。
    const kw = search.trim().toLowerCase();
    return data.notes
      .filter((n) => n.favorite)
      .filter((n) => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw))
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  }, [data.notes, search]);

  const current = selectedId
    ? favoriteNotes.find((n) => n.id === selectedId)
    : favoriteNotes.length
      ? favoriteNotes[0]
      : undefined;

  useEffect(() => {
    // 当列表项缺少 richContent 时按需拉取详情补全预览。
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
          const nextData: NotebookData = {
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

  const cancelFavorite = async (id: string) => {
    // 取消收藏后同步更新本地缓存，保持各页面状态一致。
    const noteId = Number(id);
    try {
      if (Number.isInteger(noteId)) {
        await updateNotebookNoteFavorite(noteId, false);
      }
      const next: NotebookData = {
        ...data,
        notes: data.notes.map((n) => (n.id === id ? { ...n, favorite: false } : n)),
      };
      setData(next);
      saveNotebookData(next);
      message.success('已取消收藏');
      if (selectedId === id) {
        setSelectedId(null);
      }
    } catch {
      message.error('取消收藏失败，请稍后重试');
    }
  };

  // 左侧中栏：收藏列表与搜索入口。
  const middle = (
    <>
      <div className="nb-ws-panel">
        <input
          className="nb-ws-search"
          placeholder="搜索收藏笔记"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {favoriteNotes.map((n) => (
        <div
          key={n.id}
          className={`nb-ws-item${current?.id === n.id ? ' active' : ''}`}
          onClick={() => setSelectedId(n.id)}
        >
          <div>{n.title}</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 6 }}>{n.time}</div>
        </div>
      ))}
      {!favoriteNotes.length ? <div style={{ color: '#9ca3af' }}>暂无收藏笔记</div> : null}
    </>
  );

  return (
    <NotebookWorkspace middle={middle}>
      <h1 className="nb-ws-title">收藏笔记</h1>
      <div className="nb-ws-card">
        {!current ? (
          <div style={{ color: '#9ca3af' }}>请选择一条收藏笔记查看详情</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 style={{ marginTop: 0, marginBottom: 8 }}>★ {current.title}</h2>
              <button
                type="button"
                className="nb-ws-filter-btn"
                onClick={() => void cancelFavorite(current.id)}
              >
                取消收藏
              </button>
            </div>
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
                  dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(current.richContent || '') }}
                />
              ) : (
                <div className="nb-note-plain-preview">{current.content || '（暂无正文）'}</div>
              )}
            </div>
          </>
        )}
      </div>
    </NotebookWorkspace>
  );
};

export default FavoritesPage;
