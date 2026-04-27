import { SearchOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import { Input, Modal, message } from 'antd';
import React, { useMemo, useState } from 'react';
import {
  addNotebookCategory,
  deleteNotebookCategories,
  listNotebookCategories,
  listNotebookNotes,
  updateNotebookCategory,
  updateNotebookNote,
} from '@/services/api/notebook';
import NotebookWorkspace from '../components/NotebookWorkspace';
import {
  categoryNamesByIds,
  loadNotebookData,
  saveNotebookData,
  type NotebookCategory,
  type NotebookData,
} from '../note/storage';
import './index.less';

type CategoryWithDescription = NotebookCategory & { description?: string };

function toDisplayTime(time?: string) {
  if (!time) return '—';
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? time : d.toLocaleString();
}

function getNextCategoryName(categories: NotebookCategory[]) {
  const baseName = '新分类';
  const usedNames = new Set(categories.map((c) => c.name.trim()));
  if (!usedNames.has(baseName)) return baseName;

  let index = 2;
  while (usedNames.has(`${baseName} (${index})`)) {
    index += 1;
  }
  return `${baseName} (${index})`;
}

const CategoryPage: React.FC = () => {
  const [data, setData] = useState<NotebookData>(() => loadNotebookData());
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<'count' | 'name'>('count');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorName, setEditorName] = useState('');
  const [editorDesc, setEditorDesc] = useState('');
  const [addNotesOpen, setAddNotesOpen] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  const reloadNotebookData = React.useCallback(async () => {
    try {
      const [categories, notePage] = await Promise.all([
        listNotebookCategories(),
        listNotebookNotes({ current: 1, pageSize: 500 }),
      ]);
      const next: NotebookData = {
        categories: (categories || []).flatMap((c) =>
          typeof c.id === 'number'
            ? [
                {
                  id: c.id,
                  name: c.name || '未命名分类',
                  createdAt: c.createdAt,
                  updatedAt: c.updatedAt,
                },
              ]
            : [],
        ),
        notes: (notePage?.list || []).map((n) => ({
          id: String(n.id),
          title: n.title || '未命名笔记',
          content: n.content || '',
          time: n.updatedAt ? new Date(n.updatedAt).toLocaleString() : new Date().toLocaleString(),
          categoryIds: (n.categories || [])
            .map((c) => c.id)
            .filter((id): id is number => typeof id === 'number'),
        })),
      };
      setData(next);
      saveNotebookData(next);
    } catch {
      message.error('加载后端分类数据失败，已回退本地缓存');
    }
  }, []);

  React.useEffect(() => {
    void reloadNotebookData();
  }, [reloadNotebookData]);

  const getCategoryDescription = (category?: NotebookCategory) =>
    ((category as CategoryWithDescription | undefined)?.description || '').trim();

  const categories = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const filtered = data.categories.filter((c) => c.name.toLowerCase().includes(kw));
    return filtered.slice().sort((a, b) => {
      if (sortMode === 'name') {
        return a.name.localeCompare(b.name, 'zh-CN');
      }
      const aCount = data.notes.filter((n) => n.categoryIds.includes(a.id)).length;
      const bCount = data.notes.filter((n) => n.categoryIds.includes(b.id)).length;
      return bCount - aCount;
    });
  }, [data.categories, data.notes, search, sortMode]);

  const selected = useMemo(
    () => (selectedId === null ? undefined : data.categories.find((c) => c.id === selectedId)),
    [data.categories, selectedId],
  );

  const notesInSelected = useMemo(
    () => (selected ? data.notes.filter((n) => n.categoryIds.includes(selected.id)) : []),
    [data.notes, selected],
  );
  const filteredNotesInSelected = useMemo(() => {
    const kw = noteFilter.trim().toLowerCase();
    if (!kw) return notesInSelected;
    return notesInSelected.filter(
      (n) => n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw),
    );
  }, [noteFilter, notesInSelected]);
  const createdAt = useMemo(() => {
    return toDisplayTime((selected as CategoryWithDescription | undefined)?.createdAt);
  }, [selected]);
  const updatedAt = useMemo(() => {
    const category = selected as CategoryWithDescription | undefined;
    return toDisplayTime(category?.updatedAt || category?.createdAt);
  }, [selected]);

  React.useEffect(() => {
    if (!categories.length) {
      setSelectedId(null);
      return;
    }
    if (selectedId === null || !categories.some((c) => c.id === selectedId)) {
      setSelectedId(categories[0].id);
    }
  }, [categories, selectedId]);

  const createCategory = async () => {
    const trimmed = getNextCategoryName(data.categories);
    if (data.categories.some((c) => c.name === trimmed)) {
      message.warning('分类名称已存在');
      return;
    }
    try {
      const newId = await addNotebookCategory(trimmed);
      await reloadNotebookData();
      if (newId !== undefined && newId !== null) setSelectedId(newId);
      message.success('分类已创建');
    } catch {
      message.error('创建分类失败');
    }
  };

  const openEditor = () => {
    if (!selected) {
      message.warning('请先选择分类');
      return;
    }
    setEditorName(selected.name);
    setEditorDesc(getCategoryDescription(selected));
    setEditorOpen(true);
  };

  const openAddNotes = () => {
    if (!selected) {
      message.warning('请先选择分类');
      return;
    }
    setNoteSearch('');
    setSelectedNoteIds([]);
    setAddNotesOpen(true);
  };

  const saveCategory = async () => {
    if (!selected) return;
    const trimmed = editorName.trim();
    if (!trimmed) {
      message.warning('分类名称不能为空');
      return;
    }
    if (data.categories.some((c) => c.id !== selected.id && c.name === trimmed)) {
      message.warning('分类名称已存在');
      return;
    }
    try {
      await updateNotebookCategory(selected.id, trimmed);
      await reloadNotebookData();
      message.success('分类内容已更新');
      setEditorOpen(false);
    } catch {
      message.error('更新分类失败');
    }
  };

  const candidateNotes = useMemo(() => {
    const kw = noteSearch.trim().toLowerCase();
    return data.notes
      .filter((n) => {
        if (!kw) return true;
        return n.title.toLowerCase().includes(kw) || n.content.toLowerCase().includes(kw);
      })
      .slice()
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  }, [data.notes, noteSearch]);

  const addSelectedNotesToCategory = async () => {
    if (!selected) return;
    if (!selectedNoteIds.length) {
      message.warning('请先选择笔记');
      return;
    }
    const selectedSet = new Set(selectedNoteIds);
    let addedCount = 0;
    const next: NotebookData = {
      ...data,
      notes: data.notes.map((n) => {
        if (!selectedSet.has(n.id)) return n;
        if (n.categoryIds.includes(selected.id)) return n;
        addedCount += 1;
        return {
          ...n,
          categoryIds: [...n.categoryIds, selected.id],
          time: new Date().toLocaleString(),
        };
      }),
    };
    if (addedCount === 0) {
      message.info('所选笔记已在当前分类中');
      return;
    }
    try {
      const changed = next.notes.filter((n) => selectedSet.has(n.id));
      await Promise.all(
        changed
          .map((n) => Number(n.id))
          .filter((id) => Number.isInteger(id))
          .map((id) => {
            const note = next.notes.find((x) => Number(x.id) === id);
            if (!note) return Promise.resolve();
            return updateNotebookNote({
              id,
              title: note.title,
              content: note.content,
              richContent: note.richContent,
              categoryIds: note.categoryIds,
            });
          }),
      );
      await reloadNotebookData();
      message.success(`已将 ${addedCount} 条笔记加入当前分类`);
      setAddNotesOpen(false);
      setSelectedNoteIds([]);
    } catch {
      message.error('加入分类失败');
    }
  };

  const deleteCategory = () => {
    if (!selected) {
      message.warning('请先选择分类');
      return;
    }
    Modal.confirm({
      title: '删除分类',
      content: `确定删除「${selected.name}」吗？该分类会从关联笔记中移除。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteNotebookCategories([selected.id]);
          await reloadNotebookData();
          setSelectedId(null);
          message.success('分类已删除');
        } catch {
          message.error('删除分类失败');
        }
      },
    });
  };

  const removeNoteFromCategory = async (noteId: string) => {
    if (!selected) return;
    const note = data.notes.find((n) => n.id === noteId);
    const id = Number(noteId);
    if (!note || !Number.isInteger(id)) return;
    try {
      await updateNotebookNote({
        id,
        title: note.title,
        content: note.content,
        richContent: note.richContent,
        categoryIds: note.categoryIds.filter((cid) => cid !== selected.id),
      });
      await reloadNotebookData();
      message.success('已从分类移除笔记');
    } catch {
      message.error('移出分类失败');
    }
  };

  const middle = (
    <>
      <div className="nb-ws-panel nb-category-side-panel">
        <input
          className="nb-ws-search"
          placeholder="搜索分类"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="nb-category-side-actions">
          <button type="button" className="nb-category-create-btn" onClick={createCategory}>
            ＋ 新建分类
          </button>
          <div className="nb-category-sort-row">
            <span className="nb-category-sort-hint">列表排序</span>
            <button
              type="button"
              className="nb-category-sort-toggle"
              title="在「按数量」和「按名称」之间切换"
              onClick={() => setSortMode((v) => (v === 'count' ? 'name' : 'count'))}
            >
              {sortMode === 'count' ? '按数量' : '按名称'}
              <span className="nb-category-sort-caret" aria-hidden>
                ▾
              </span>
            </button>
          </div>
        </div>
      </div>
      {categories.map((c) => {
        const catNotes = data.notes.filter((n) => n.categoryIds.includes(c.id));
        const count = catNotes.length;
        const latest = catNotes
          .slice()
          .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))[0];
        const preview =
          getCategoryDescription(c) || latest?.content?.slice(0, 42) || '用于归档笔记，可与多篇笔记建立关联。';
        return (
          <div
            key={c.id}
            className={`nb-ws-item nb-category-list-item${selected?.id === c.id ? ' active' : ''}`}
            onClick={() => setSelectedId(c.id)}
          >
            <div className="nb-category-list-row">
              <div className="nb-category-list-title">{c.name}</div>
              <span className="nb-category-count-badge">{count} 篇</span>
            </div>
            <div className="nb-category-list-desc">{preview}</div>
            <div className="nb-category-list-meta">
              最近修改：{toDisplayTime((c as CategoryWithDescription).updatedAt || latest?.time)}
            </div>
          </div>
        );
      })}
      {!categories.length ? <div className="nb-category-empty">没有匹配的分类</div> : null}
    </>
  );

  return (
    <NotebookWorkspace middle={middle}>
      <h1 className="nb-ws-title">分类管理</h1>
      <div className="nb-ws-card nb-category-main-card">
        {!selected ? (
          <div className="nb-category-empty">请从左侧选择一个分类</div>
        ) : (
          <>
            <div className="nb-category-topbar">
              <div>
                <h2 className="nb-category-main-title">{selected.name}</h2>
                <div className="nb-category-main-sub">当前分类下共 {notesInSelected.length} 条笔记</div>
              </div>
              <div className="nb-category-top-actions">
                <button type="button" className="nb-category-top-link danger" onClick={deleteCategory}>
                  删除分类
                </button>
                <button type="button" className="nb-category-add-btn" onClick={openAddNotes}>
                  增加笔记
                </button>
                <button type="button" className="nb-category-save-btn" onClick={openEditor}>
                  修改内容
                </button>
              </div>
            </div>
            <div className="nb-category-intro-card">
              <div className="nb-category-label">简介</div>
              <div className="nb-category-intro-text">
                {getCategoryDescription(selected) || '暂无简介，点击「修改内容」可补充。'}
              </div>
              <div className="nb-category-created-time">创建时间：{createdAt}</div>
              <div className="nb-category-created-time">最近修改：{updatedAt}</div>
            </div>
            <div className="nb-category-section-title-row">
              <div className="nb-category-section-title">分类下笔记</div>
              <Input
                className="nb-category-note-search"
                placeholder="搜索当前分类下的笔记"
                value={noteFilter}
                onChange={(e) => setNoteFilter(e.target.value)}
                prefix={<SearchOutlined />}
                allowClear
              />
            </div>
            {filteredNotesInSelected.length ? (
              filteredNotesInSelected.map((n) => (
                <div className="nb-category-note-item" key={n.id}>
                  <div className="nb-category-note-main">
                    <div className="nb-category-note-title">{n.title}</div>
                    <div className="nb-category-note-time">最近修改：{n.time}</div>
                    <div className="nb-category-note-preview">{(n.content || '（暂无正文）').slice(0, 140)}</div>
                  </div>
                  <div className="nb-category-note-actions">
                    <button
                      type="button"
                      className="nb-category-note-view-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        history.push(`/notebook/note?note=${encodeURIComponent(n.id)}&category=${selected.id}`);
                      }}
                    >
                      查看
                    </button>
                    <button
                      type="button"
                      className="nb-category-pill-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeNoteFromCategory(n.id);
                      }}
                    >
                      移出分类
                    </button>
                  </div>
                </div>
              ))
            ) : notesInSelected.length ? (
              <div className="nb-category-empty">当前分类下没有匹配的笔记</div>
            ) : (
              <div className="nb-category-empty">该分类暂无笔记</div>
            )}
          </>
        )}
      </div>
      <Modal
        title="修改分类内容"
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={saveCategory}
        okText="保存"
        cancelText="取消"
      >
        <div className="nb-category-modal-field">
          <div className="nb-category-label">分类名称</div>
          <Input
            value={editorName}
            onChange={(e) => setEditorName(e.target.value)}
            placeholder="请输入分类名称"
            maxLength={20}
          />
        </div>
        <div className="nb-category-modal-field">
          <div className="nb-category-label">分类简介</div>
          <Input.TextArea
            value={editorDesc}
            onChange={(e) => setEditorDesc(e.target.value)}
            placeholder="例如：用于项目阶段性总结、里程碑记录与复盘"
            rows={4}
            maxLength={100}
          />
          <div className="nb-category-desc-count">{editorDesc.length} / 100</div>
        </div>
      </Modal>
      <Modal
        title={`增加笔记到「${selected?.name || ''}」`}
        open={addNotesOpen}
        onCancel={() => setAddNotesOpen(false)}
        onOk={addSelectedNotesToCategory}
        okText="加入分类"
        cancelText="取消"
        width={720}
      >
        <div className="nb-category-modal-field">
          <div className="nb-category-label">筛选笔记</div>
          <Input
            value={noteSearch}
            onChange={(e) => setNoteSearch(e.target.value)}
            placeholder="按标题或正文搜索"
            allowClear
          />
        </div>
        <div className="nb-category-pick-list">
          {candidateNotes.map((n) => {
            const checked = selectedNoteIds.includes(n.id);
            const categoryName = categoryNamesByIds(data.categories, n.categoryIds);
            return (
              <label key={n.id} className={`nb-category-pick-item${checked ? ' checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    setSelectedNoteIds((prev) => {
                      if (e.target.checked) return [...prev, n.id];
                      return prev.filter((id) => id !== n.id);
                    });
                  }}
                />
                <div className="nb-category-pick-main">
                  <div className="nb-category-pick-title">{n.title}</div>
                  <div className="nb-category-pick-meta">
                    当前分类：{categoryName} · 最近修改：{n.time}
                  </div>
                </div>
              </label>
            );
          })}
          {!candidateNotes.length ? <div className="nb-category-empty">没有匹配的笔记</div> : null}
        </div>
      </Modal>
    </NotebookWorkspace>
  );
};

export default CategoryPage;
