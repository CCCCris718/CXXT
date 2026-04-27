import React, { useEffect, useMemo, useState } from 'react';
import { listNotebookCategories, listNotebookNotes } from '@/services/api/notebook';
import NotebookWorkspace from '../components/NotebookWorkspace';
import { loadNotebookData, mergeNoteFavorite, type NotebookData, type NotebookNote } from '../note/storage';
import './index.less';

function toTime(t: string): number {
  const x = Date.parse(t);
  return Number.isNaN(x) ? 0 : x;
}

function toDisplayTime(time?: string): string {
  if (!time) return '—';
  const d = new Date(time);
  return Number.isNaN(d.getTime()) ? time : d.toLocaleString();
}

type StatisticsWindow = 7 | 30 | 'all';
type StatisticsNote = NotebookNote & { createdTime?: string };
type StatisticsData = Omit<NotebookData, 'notes'> & { notes: StatisticsNote[] };
const CATEGORY_PREVIEW_LIMIT = 5;

function formatDelta(delta: number): string {
  if (delta > 0) return `较上期 +${delta}`;
  if (delta < 0) return `较上期 ${delta}`;
  return '较上期 持平';
}

const StatisticsPage: React.FC = () => {
  const [data, setData] = useState<StatisticsData>(() => loadNotebookData());
  const [windowDays, setWindowDays] = useState<StatisticsWindow>(7);
  const [barsExpanded, setBarsExpanded] = useState(false);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [animProgress, setAnimProgress] = useState(0);

  const reloadData = async () => {
    try {
      const [categories, notes] = await Promise.all([
        listNotebookCategories(),
        listNotebookNotes({ current: 1, pageSize: 500 }),
      ]);
      setData({
        categories: (categories || []).flatMap((c) =>
          typeof c.id === 'number'
            ? [{ id: c.id, name: c.name || '未命名分类', createdAt: c.createdAt, updatedAt: c.updatedAt }]
            : [],
        ),
        notes: (notes?.list || []).map((n) => ({
          id: String(n.id),
          title: n.title || '',
          content: n.content || '',
          time: n.updatedAt ? new Date(n.updatedAt).toLocaleString() : new Date().toLocaleString(),
          createdTime: n.createdAt ? new Date(n.createdAt).toLocaleString() : undefined,
          categoryIds: (n.categories || [])
            .map((c) => c.id)
            .filter((id): id is number => typeof id === 'number'),
          favorite: mergeNoteFavorite(n.favorite, undefined),
        })),
      });
    } catch {
      // keep local fallback
    }
  };

  useEffect(() => {
    void reloadData();
  }, []);

  const now = Date.now();
  const windowMs = windowDays === 'all' ? null : windowDays * 24 * 3600 * 1000;
  const inWindow = (time: string) => windowMs === null || now - toTime(time) <= windowMs;
  const inPreviousWindow = (time: string) => {
    if (windowMs === null) return false;
    const age = now - toTime(time);
    return age > windowMs && age <= windowMs * 2;
  };
  const notesInWindow = data.notes.filter((n) => inWindow(n.time));
  const notesInPreviousWindow = data.notes.filter((n) => inPreviousWindow(n.time));

  const byCategory = data.categories.map((c) => {
    const notes = notesInWindow.filter((n) => n.categoryIds.includes(c.id));
    const latestNote = notes.length ? notes.slice().sort((a, b) => toTime(b.time) - toTime(a.time))[0] : undefined;
    const latest = latestNote?.time || toDisplayTime(c.updatedAt || c.createdAt);
    return { ...c, count: notes.length, latest };
  });
  const visibleBarCategories = barsExpanded ? byCategory : byCategory.slice(0, CATEGORY_PREVIEW_LIMIT);
  const hiddenBarCategoryCount = Math.max(byCategory.length - visibleBarCategories.length, 0);
  const visibleTableCategories = tableExpanded ? byCategory : byCategory.slice(0, CATEGORY_PREVIEW_LIMIT);
  const hiddenTableCategoryCount = Math.max(byCategory.length - visibleTableCategories.length, 0);
  const maxCount = Math.max(1, ...byCategory.map((x) => x.count));

  const favoriteInWindowCount = notesInWindow.filter((n) => n.favorite).length;
  const favoriteRatio = notesInWindow.length ? Math.round((favoriteInWindowCount / notesInWindow.length) * 100) : 0;
  const categoriesInWindowCount = byCategory.filter((x) => x.count > 0).length;
  const emptyCategoryCount = Math.max(data.categories.length - categoriesInWindowCount, 0);
  const linkedInWindowCount = notesInWindow.filter((n) => n.categoryIds.length > 0).length;
  const unlinkedInWindowCount = Math.max(notesInWindow.length - linkedInWindowCount, 0);
  const previousUnlinkedCount = data.notes.filter(
    (n) => inPreviousWindow(n.time) && n.categoryIds.length === 0,
  ).length;
  const singleClassifiedCount = notesInWindow.filter((n) => n.categoryIds.length === 1).length;
  const multiClassifiedCount = notesInWindow.filter((n) => n.categoryIds.length > 1).length;

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const duration = 720;
    const tick = (nowMs: number) => {
      const p = Math.min((nowMs - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setAnimProgress(eased);
      if (p < 1) {
        raf = requestAnimationFrame(tick);
      }
    };
    setAnimProgress(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [data, windowDays]);

  const animated = useMemo(
    () => ({
      notesInWindow: Math.round(notesInWindow.length * animProgress),
      categoriesInWindow: Math.round(categoriesInWindowCount * animProgress),
      unlinkedInWindow: Math.round(unlinkedInWindowCount * animProgress),
      favoriteInWindow: Math.round(favoriteInWindowCount * animProgress),
    }),
    [animProgress, categoriesInWindowCount, favoriteInWindowCount, notesInWindow.length, unlinkedInWindowCount],
  );

  const donutStyle = {
    background: `conic-gradient(
      #2f63db 0deg ${(singleClassifiedCount / Math.max(notesInWindow.length, 1)) * 360 * animProgress}deg,
      #7fb0e5 ${(singleClassifiedCount / Math.max(notesInWindow.length, 1)) * 360 * animProgress}deg ${((singleClassifiedCount + multiClassifiedCount) / Math.max(notesInWindow.length, 1)) * 360 * animProgress}deg,
      #bcc6d2 ${((singleClassifiedCount + multiClassifiedCount) / Math.max(notesInWindow.length, 1)) * 360 * animProgress}deg 360deg
    )`,
  };

  return (
    <NotebookWorkspace>
      <div className="nb-stat-topbar">
        <div>
          <h1 className="nb-ws-title">数据统计</h1>
        </div>
        <div className="nb-stat-top-actions">
          {([7, 30, 'all'] as const).map((d) => (
            <button
              type="button"
              key={d}
              className={`nb-stat-action-btn nb-stat-range-btn${windowDays === d ? ' active' : ''}`}
              onClick={() => setWindowDays(d)}
            >
              {d === 'all' ? '全部' : `近 ${d} 天`}
            </button>
          ))}
          <button type="button" className="nb-stat-action-btn nb-stat-refresh" onClick={() => void reloadData()}>
            刷新数据
          </button>
        </div>
      </div>
      <div className="nb-row nb-stat-kpis">
        <div className="nb-ws-card nb-stat-kpi-card">
          <div className="nb-stat-kpi-label">{windowDays === 'all' ? '笔记总数' : '范围内笔记'}</div>
          <div className="nb-stat-kpi-value">{animated.notesInWindow}</div>
          <div className="nb-stat-kpi-sub">
            {windowDays === 'all'
              ? '当前范围：全部笔记'
              : formatDelta(notesInWindow.length - notesInPreviousWindow.length)}
          </div>
        </div>
        <div className="nb-ws-card nb-stat-kpi-card">
          <div className="nb-stat-kpi-label">{windowDays === 'all' ? '有笔记分类' : '范围内分类'}</div>
          <div className="nb-stat-kpi-value">{animated.categoriesInWindow}</div>
          <div className="nb-stat-kpi-sub">空分类 {emptyCategoryCount} 个</div>
        </div>
        <div className="nb-ws-card nb-stat-kpi-card">
          <div className="nb-stat-kpi-label">未分类笔记</div>
          <div className="nb-stat-kpi-value">{animated.unlinkedInWindow}</div>
          <div className="nb-stat-kpi-sub">
            {windowDays === 'all'
              ? `未分类占比 ${notesInWindow.length ? Math.round((unlinkedInWindowCount / notesInWindow.length) * 100) : 0}%`
              : formatDelta(unlinkedInWindowCount - previousUnlinkedCount)}
          </div>
        </div>
        <div className="nb-ws-card nb-stat-kpi-card">
          <div className="nb-stat-kpi-label">收藏笔记</div>
          <div className="nb-stat-kpi-value">{animated.favoriteInWindow}</div>
          <div className="nb-stat-kpi-sub">占当前范围 {favoriteRatio}%</div>
        </div>
      </div>

      <div className="nb-row nb-stat-main-row">
        <div className="nb-ws-card nb-stat-bars">
          <div className="nb-stat-section-head">
            <h3 className="nb-stat-title">各分类笔记数量</h3>
            {byCategory.length > CATEGORY_PREVIEW_LIMIT ? (
              <button
                type="button"
                className="nb-stat-toggle-btn"
                onClick={() => setBarsExpanded((v) => !v)}
              >
                {barsExpanded ? '收起' : `展开全部 ${byCategory.length} 个`}
              </button>
            ) : null}
          </div>
          <div className="nb-stat-bars-list">
            {visibleBarCategories.map((x) => (
              <div key={x.id} className="nb-stat-bar-row">
                <div className="nb-stat-bar-head">
                  <span>{x.name}</span>
                  <span>{x.count}</span>
                </div>
                <div className="nb-stat-track">
                  <div
                    className="nb-stat-fill"
                    style={{
                      width: `${(x.count / maxCount) * 100 * animProgress}%`,
                    }}
                  />
                </div>
                <div className="nb-stat-latest">最近更新：{x.latest}</div>
              </div>
            ))}
            {!barsExpanded && hiddenBarCategoryCount > 0 ? (
              <div className="nb-stat-collapsed-hint">已收起 {hiddenBarCategoryCount} 个分类</div>
            ) : null}
          </div>
        </div>
        <div className="nb-ws-card nb-stat-donut-card">
          <h3 className="nb-stat-title">笔记关联分类情况</h3>
          <div className="nb-stat-donut-legend-row">
            <span>
              <span className="dot linked" />
              仅单分类
            </span>
            <span>
              <span className="dot multi" />
              多分类
            </span>
            <span>
              <span className="dot unlinked" />
              未分类
            </span>
          </div>
          <div className="nb-stat-donut-wrap">
            <div className="nb-stat-donut" style={donutStyle}>
              <div className="nb-stat-donut-inner" />
            </div>
            <div className="nb-stat-legend">
              <div>
                <span className="dot linked" />
                单分类：{Math.round(singleClassifiedCount * animProgress)}
              </div>
              <div>
                <span className="dot multi" />
                多分类：{Math.round(multiClassifiedCount * animProgress)}
              </div>
              <div>
                <span className="dot unlinked" />
                未分类：{Math.round(unlinkedInWindowCount * animProgress)}
              </div>
              
            </div>
          </div>
        </div>
      </div>

      <div className="nb-ws-card nb-stat-table-card">
        <div className="nb-stat-section-head">
          <h3 className="nb-stat-title">分类明细表</h3>
          {byCategory.length > CATEGORY_PREVIEW_LIMIT ? (
            <button
              type="button"
              className="nb-stat-toggle-btn"
              onClick={() => setTableExpanded((v) => !v)}
            >
              {tableExpanded ? '收起' : `展开全部 ${byCategory.length} 个`}
            </button>
          ) : null}
        </div>
        <div className="nb-stat-table">
          <div className="nb-stat-row nb-stat-head">
            <span>分类名称</span>
            <span>笔记数量</span>
            <span>最近更新</span>
          </div>
          {visibleTableCategories.map((x) => (
            <div key={x.id} className="nb-stat-row">
              <span>{x.name}</span>
              <span>{x.count}</span>
              <span>{x.latest}</span>
            </div>
          ))}
        </div>
        {!tableExpanded && hiddenTableCategoryCount > 0 ? (
          <div className="nb-stat-collapsed-hint">已收起 {hiddenTableCategoryCount} 个分类</div>
        ) : null}
      </div>
    </NotebookWorkspace>
  );
};

export default StatisticsPage;
