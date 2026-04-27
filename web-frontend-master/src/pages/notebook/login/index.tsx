import { history, Link, useModel } from '@umijs/max';
import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { login } from '@/services/api/authentication';
import { setLoginDisplayName } from '@/utils/displayUserName';
import '../auth.less';

const REMEMBER_LOGIN_KEY = 'notebook_login_remember_v1';

type RememberedLogin = {
  username: string;
  password: string;
};

function loadRememberedLogin(): RememberedLogin | null {
  try {
    const raw = localStorage.getItem(REMEMBER_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedLogin>;
    if (typeof parsed.username !== 'string' || typeof parsed.password !== 'string') return null;
    return { username: parsed.username, password: parsed.password };
  } catch {
    return null;
  }
}

function saveRememberedLogin(username: string, password: string) {
  localStorage.setItem(REMEMBER_LOGIN_KEY, JSON.stringify({ username, password }));
}

function clearRememberedLogin() {
  localStorage.removeItem(REMEMBER_LOGIN_KEY);
}

const Login: React.FC = () => {
  const { initialState, setInitialState } = useModel('@@initialState');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'error' } | null>(null);

  const showMessage = (text: string, type: 'info' | 'error') => {
    setMsg({ text, type });
  };

  useEffect(() => {
    const remembered = loadRememberedLogin();
    if (!remembered) return;
    setUsername(remembered.username);
    setPassword(remembered.password);
    setRemember(true);
  }, []);

  const fetchUserInfo = async (): Promise<API.Token | undefined> => {
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
      const res = await login({ userId: user, password: pass });
      if (!res) {
        showMessage('登录请求失败（请检查网络或 Mock 是否开启）', 'error');
        return;
      }
      if ((res as API.LoginResult).status === 'error') {
        showMessage('账号不存在或密码错误；若还没有账号，请先注册。', 'error');
        return;
      }
      const tok = res as API.Token;
      setLoginDisplayName((tok.userCode && tok.userCode.trim()) || user);
      if (remember) {
        saveRememberedLogin(user, pass);
      } else {
        clearRememberedLogin();
      }
      const userInfo = await fetchUserInfo();
      if (userInfo) {
        const { applyNotebookProfileFromToken } = await import('@/utils/notebookUserProfile');
        applyNotebookProfileFromToken(userInfo);
      }
      const display = userInfo ? (userInfo as API.Token).userCode?.trim() || user : user;
      let text = `登录成功，用户名：${display}`;
      if (remember) text += '（已选择记住密码）';
      showMessage(text, 'info');
      history.push('/notebook/note');
    } catch (e: unknown) {
      const err = e as { message?: string };
      showMessage(err?.message || '登录失败', 'error');
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

            <div className="nb-auth-row">
              <label className="nb-auth-remember">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>记住密码</span>
              </label>
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
