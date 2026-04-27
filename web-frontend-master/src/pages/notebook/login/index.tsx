import { history, Link, useModel } from '@umijs/max';
import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { login } from '@/services/api/authentication';
import { setLoginDisplayName } from '@/utils/displayUserName';
import '../auth.less';

function mapAuthOrOriginal(m: string): string {
  // 将后端认证失败文案统一映射为前端规范提示。
  if (/invalid username or password/i.test(m) || m.includes('用户名或密码') || m.includes('密码错误')) {
    return '用户名或密码错误，若未注册请先注册。';
  }
  return m;
}

/** 登录接口 BizError / Axios 错误等转为页面展示文案（认证失败不提示「网络 / Mock」） */
function getLoginErrorMessage(err: unknown): string {
  if (err === undefined || err === null) return '登录失败，请稍后重试';
  if (typeof err === 'object') {
    const o = err as {
      name?: string;
      info?: { message?: string };
      response?: { data?: { message?: string; success?: boolean } };
    };
    if (o.name === 'BizError' && o.info?.message) {
      return mapAuthOrOriginal(o.info.message);
    }
    if (o.info?.message) {
      return mapAuthOrOriginal(o.info.message);
    }
    const dataMsg = o.response?.data;
    if (dataMsg && dataMsg.success === false && dataMsg.message) {
      return mapAuthOrOriginal(dataMsg.message);
    }
  }
  if (err instanceof Error) {
    const m = err.message || '';
    if (/invalid username or password/i.test(m)) {
      return '用户名或密码错误，若未注册请先注册。';
    }
    if (/network/i.test(m) || m === 'Network Error') {
      return '网络异常，请检查网络后重试';
    }
    if (m && m !== 'Request failed' && m !== 'Request failed with status code 200') {
      return m;
    }
  }
  return '登录失败，请稍后重试';
}

const Login: React.FC = () => {
  // 登录页仅维护最小表单状态，用户信息由全局 initialState 承载。
  const { initialState, setInitialState } = useModel('@@initialState');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'error' } | null>(null);

  const showMessage = (text: string, type: 'info' | 'error') => {
    setMsg({ text, type });
  };

  /** 历史版本曾把密码存 localStorage，进入登录页时清除 */
  useEffect(() => {
    try {
      localStorage.removeItem('notebook_login_remember_v1');
    } catch {
      // ignore
    }
  }, []);

  const fetchUserInfo = async (): Promise<API.Token | undefined> => {
    // 复用全局获取用户信息逻辑，保证会话态更新路径一致。
    const userInfo = await initialState?.fetchUserInfo?.();
    if (userInfo) {
      flushSync(() => {
        setInitialState((s) => ({
          ...s,
          currentToken: userInfo,
        }));
      });
      return userInfo;
    }
    return undefined;
  };

  const onLogin = async () => {
    // 登录主流程：前端校验 -> 认证接口 -> 全局状态写入 -> 页面跳转。
    const user = username.trim();
    const pass = password.trim();
    if (!user) {
      showMessage('请输入用户名', 'error');
      return;
    }
    if (!pass) {
      showMessage('请输入密码', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await login(
        { userId: user, password: pass },
        { throwError: true, skipErrorHandler: true },
      );
      if (res && typeof res === 'object' && 'success' in (res as object)) {
        const r = res as { success?: boolean; message?: string };
        if (r.success === false) {
          showMessage(
            r.message
              ? mapAuthOrOriginal(r.message)
              : '用户名或密码错误，若未注册请先注册。',
            'error',
          );
          return;
        }
      }
      if (!res) {
        // 在 throwError 已开启时少见；无法区分空结果与网络问题时，避免只写「Mock/网络」误导为纯连接错误
        showMessage('登录未成功。请核对用户名与密码；若仍失败，请检查网络与后端服务。', 'error');
        return;
      }
      if ((res as API.LoginResult).status === 'error') {
        showMessage('用户名或密码错误，若未注册请先注册。', 'error');
        return;
      }
      const tok = res as API.Token;
      // 展示名优先使用服务端返回 userCode，其次回退输入用户名。
      setLoginDisplayName((tok.userCode && tok.userCode.trim()) || user);
      const userInfo = await fetchUserInfo();
      if (userInfo) {
        const { applyNotebookProfileFromToken } = await import('@/utils/notebookUserProfile');
        applyNotebookProfileFromToken(userInfo);
      }
      const display = userInfo ? (userInfo as API.Token).userCode?.trim() || user : user;
      showMessage(`登录成功，用户名：${display}`, 'info');
      history.push('/notebook/note');
    } catch (e: unknown) {
      showMessage(getLoginErrorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nb-auth-root nb-auth-login">
      <div className="nb-auth-container nb-auth-login-card">
        <span className="nb-auth-sdu-brand" role="img" aria-label="山东大学">
          <img className="nb-auth-sdu-logo" src="/sdu-logo.png" alt="" />
        </span>
        <div className="nb-auth-container-inner">
        <div className="nb-auth-left">
          <div className="nb-auth-left-inner">
            <h1>欢迎使用</h1>
            <p className="nb-auth-left-line">
              山东大学崇新学堂开放性创新实践软件部分课程设计
            </p>
            <br/>
            <p>
              在线笔记本系统
            </p>
            <p className="nb-auth-left-members">小组成员：季佳乐 刘城 宋奕达</p>
            
          </div>
        </div>

        <div className="nb-auth-right">
          <div className="nb-auth-form-wrap">
            <h2>用户登录</h2>
            <div
              className="nb-auth-subtitle nb-auth-subtitle--spacer"
              aria-hidden="true"
            />

            <div className="nb-auth-field">
              <label htmlFor="nb-login-user">用户名</label>
              <input
                id="nb-login-user"
                type="text"
                placeholder="请输入用户名"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="nb-auth-field">
              <label htmlFor="nb-login-pass">密码</label>
              <input
                id="nb-login-pass"
                type="password"
                placeholder="请输入密码"
                autoComplete="current-password"
                title="本地 Mock 环境下密码为 ant.design"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="nb-auth-row nb-auth-row--forgot-only">
              <button type="button" className="nb-auth-link-btn" onClick={() => showMessage('请联系管理员重置密码。', 'info')}>
                忘记密码？
              </button>
            </div>

            <button
              type="button"
              className="nb-auth-submit"
              disabled={loading}
              onClick={() => void onLogin()}
            >
              {loading ? '登录中…' : '立即登录'}
            </button>

            {msg && <div className={`nb-auth-message ${msg.type}`}>{msg.text}</div>}

            <div className="nb-auth-bottom">
              还没有账号？
              <Link to="/notebook/register" className="nb-auth-link-btn" style={{ marginLeft: 4 }}>
                立即注册
              </Link>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
