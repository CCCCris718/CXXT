import { APP_LOGIN_PATH } from '@/constants/auth';
import { logout } from '@/services/api/authentication';
import {
  clearLoginDisplayName,
  getDisplayUserName,
} from '@/utils/displayUserName';
import { applyNotebookProfileFromToken } from '@/utils/notebookUserProfile';
import { history, useLocation, useModel } from '@umijs/max';
import { Modal, message } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { loadNotebookData } from '../note/storage';
import AutoFitOneLine from './AutoFitOneLine';
import './NotebookWorkspace.less';

type NotebookWorkspaceProps = {
  /** 中间功能栏（如笔记列表）。个人中心等页面可省略，主内容区会占满剩余宽度。 */
  middle?: React.ReactNode;
  children: React.ReactNode;
};

const NOTE_SETTINGS_KEY = 'notebook_note_settings_v1';

type NoteSort = 'recent' | 'titleAsc' | 'titleDesc';
type AutoSaveInterval = 'off' | '30s' | '1m' | '5m';
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

const NotebookWorkspace: React.FC<NotebookWorkspaceProps> = ({ middle, children }) => {
  const hasMiddle = middle != null;
  const { initialState, setInitialState } = useModel('@@initialState');
  const currentToken = initialState?.currentToken;
  const pathname = useLocation().pathname;
  const userLabel = getDisplayUserName(currentToken);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<NoteSettings>(() => loadNoteSettings());
  const [categories, setCategories] = useState(() => loadNotebookData().categories);

  useEffect(() => {
    localStorage.setItem(NOTE_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (currentToken?.accountType === 'NOTEBOOK_USER') {
      applyNotebookProfileFromToken(currentToken);
    }
  }, [currentToken]);

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

  return (
    <div className={`nb-ws-page nb-theme-${settings.theme} nb-setting-font-${settings.fontScale}`}>
      <div className={hasMiddle ? 'nb-ws-app' : 'nb-ws-app nb-ws-app--no-middle'}>
        <aside className="nb-ws-sidebar">
          <div className="nb-ws-logo">我的笔记</div>
          <div className="nb-ws-user-card">
            <AutoFitOneLine
              className="nb-ws-user-name"
              title={userLabel ? `用户：${userLabel}` : '用户：—'}
              maxFontSize={18}
              minFontSize={18}
            >
              {userLabel ? `用户：${userLabel}` : '用户：—'}
            </AutoFitOneLine>
            <div className="nb-ws-user-line">
              <span className="nb-ws-user-key">身份：</span>
              <span>普通用户</span>
            </div>
            <div className="nb-ws-user-line">
              <span className="nb-ws-user-key">状态：</span>
              <span>已登录</span>
            </div>
          </div>

          <div className="nb-ws-nav-title">功能导航</div>
          <div
            className={`nb-ws-nav-item${pathname === '/notebook/note' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/note')}
          >
            笔记管理
          </div>
          <div
            className={`nb-ws-nav-item${pathname === '/notebook/category' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/category')}
          >
            分类管理
          </div>
          <div
            className={`nb-ws-nav-item${pathname === '/notebook/statistics' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/statistics')}
          >
            数据统计
          </div>
          <div
            className={`nb-ws-nav-item${pathname === '/notebook/favorites' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/favorites')}
          >
            收藏笔记
          </div>
          <div
            className={`nb-ws-nav-item${pathname === '/notebook/recent' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/recent')}
          >
            最近编辑
          </div>
          <div
            className={`nb-ws-nav-item${pathname === '/notebook/profile' ? ' active' : ''}`}
            onClick={() => history.push('/notebook/profile')}
          >
            个人中心
          </div>

          <div className="nb-ws-nav-title">系统操作</div>
          <div
            className="nb-ws-nav-item"
            onClick={() => {
              setCategories(loadNotebookData().categories);
              setSettingsOpen(true);
            }}
          >
            系统设置
          </div>
          <div className="nb-ws-nav-item" onClick={confirmLogout}>
            退出登录
          </div>
        </aside>
        {hasMiddle ? <section className="nb-ws-middle">{middle}</section> : null}
        <main className="nb-ws-main">{children}</main>
      </div>

      <Modal
        title="系统设置"
        open={settingsOpen}
        wrapClassName={`nb-setting-modal-font-${settings.fontScale} nb-theme-modal-${settings.theme}`}
        onCancel={() => setSettingsOpen(false)}
        onOk={() => {
          setSettingsOpen(false);
          message.success('设置已保存');
        }}
        okText="保存设置"
        cancelText="取消"
        destroyOnClose
      >
        <div className="nb-ws-settings-form">
          <label className="nb-ws-settings-label">
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

          <label className="nb-ws-settings-label">
            字体大小
            <select
              value={settings.fontScale}
              onChange={(e) =>
                setSettings((s) => ({ ...s, fontScale: e.target.value as NoteSettings['fontScale'] }))
              }
            >
              <option value="small">小</option>
              <option value="medium">中</option>
              <option value="large">大</option>
            </select>
          </label>

          <label className="nb-ws-settings-label">
            界面语言
            <select
              value={settings.language}
              onChange={(e) =>
                setSettings((s) => ({ ...s, language: e.target.value as NoteSettings['language'] }))
              }
            >
              <option value="zh-CN">简体中文</option>
            </select>
          </label>

          <label className="nb-ws-settings-label">
            新笔记默认分类
            <select
              value={settings.defaultCategoryId}
              onChange={(e) => setSettings((s) => ({ ...s, defaultCategoryId: e.target.value }))}
            >
              <option value="">未分类</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <label className="nb-ws-settings-label">
            列表默认排序
            <select
              value={settings.defaultSort}
              onChange={(e) => setSettings((s) => ({ ...s, defaultSort: e.target.value as NoteSort }))}
            >
              <option value="recent">最近编辑优先</option>
              <option value="titleAsc">标题升序</option>
              <option value="titleDesc">标题降序</option>
            </select>
          </label>

          <label className="nb-ws-settings-label">
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
      </Modal>
    </div>
  );
};

export default NotebookWorkspace;
