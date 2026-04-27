import RightContent from '@/components/RightContent';
import type { Settings as LayoutSettings } from '@ant-design/pro-components';
import type { RunTimeLayoutConfig } from '@umijs/max';
import { history } from '@umijs/max';
import defaultSettings from '../config/defaultSettings';
import { errorConfig } from './requestErrorConfig';
import React from 'react';
import { APP_LOGIN_PATH, PRO_LOGIN_PATH } from '@/constants/auth';
import { getCurrentUser } from './services/api/authentication';

/** 未登录跳转目标：使用笔记本自定义登录页，而非 Pro 默认 /user/login */
const loginPath = APP_LOGIN_PATH;

/** 无需拉取用户态、未登录也可访问的页面 */
function isPublicPath(pathname: string) {
  return (
    pathname === loginPath ||
    pathname === PRO_LOGIN_PATH ||
    /** 旧书签 /user/login 会先匹配再重定向，避免未进入白名单时误拉登录态 */
    pathname === '/user/login' ||
    pathname === '/notebook/register'
  );
}

/**
 * @see  https://umijs.org/zh-CN/plugins/plugin-initial-state
 * */
export async function getInitialState(): Promise<{
  settings?: Partial<LayoutSettings>;
  currentToken?: API.Token;
  loading?: boolean;
  fetchUserInfo?: () => Promise<API.Token | undefined>;
}> {
  const fetchUserInfo = async () => {
    try {
      return await getCurrentUser({
        skipErrorHandler: true,
      });
    } catch (error) {
      history.push(loginPath);
    }
    return undefined;
  };
  const { location } = history;
  if (!isPublicPath(location.pathname)) {
    const currentToken = await fetchUserInfo();
    return {
      fetchUserInfo,
      currentToken,
      settings: defaultSettings,
    };
  }
  return {
    fetchUserInfo,
    settings: defaultSettings,
  };
}

// ProLayout 支持的api https://procomponents.ant.design/components/layout
export const layout: RunTimeLayoutConfig = ({ initialState }) => {
  return {
    token: {
      colorBgAppListIconHover: 'rgba(0,0,0,0.06)',
      colorTextAppListIconHover: 'rgba(0,0,0,0.88)',
      colorTextAppListIcon: 'rgba(0,0,0,0.7)',
      sider: {
        colorBgCollapsedButton: '#ffffff',
        colorTextCollapsedButtonHover: 'rgba(0,0,0,0.75)',
        colorTextCollapsedButton: 'rgba(0,0,0,0.5)',
        colorMenuBackground: '#ffffff',
        colorBgMenuItemCollapsedHover: 'rgba(0,0,0,0.04)',
        colorBgMenuItemCollapsedSelected: 'rgba(52, 73, 94, 0.1)',
        colorBgMenuItemCollapsedElevated: '#fafafa',
        colorMenuItemDivider: 'rgba(0,0,0,0.05)',
        colorBgMenuItemHover: 'rgba(0,0,0,0.04)',
        colorBgMenuItemSelected: 'rgba(52, 73, 94, 0.1)',
        colorTextMenuSelected: '#34495e',
        colorTextMenuItemHover: 'rgba(0,0,0,0.9)',
        colorTextMenu: 'rgba(0,0,0,0.75)',
        colorTextMenuSecondary: 'rgba(0,0,0,0.5)',
        colorTextMenuTitle: 'rgba(0,0,0,0.9)',
        colorTextMenuActive: 'rgba(0,0,0,0.9)',
        colorTextSubMenuSelected: '#34495e',
      },
    },
    rightContentRender: () => <RightContent />,
    footerRender: false,
    onPageChange: () => {
      const { location } = history;
      if (!initialState?.currentToken && !isPublicPath(location.pathname)) {
        history.push(loginPath);
      }
    },
    links: [],
    menuHeaderRender: undefined,
    // 自定义 403 页面
    // unAccessible: <div>unAccessible</div>,
    // 增加一个 loading 的状态
    childrenRender: (children) => children,
    ...initialState?.settings,
  };
};

/**
 * @name request 配置，可以配置错误处理
 * 它基于 axios 和 ahooks 的 useRequest 提供了一套统一的网络请求和错误处理方案。
 * @doc https://umijs.org/docs/max/request#配置
 */
export const request = {
  ...errorConfig,
};
