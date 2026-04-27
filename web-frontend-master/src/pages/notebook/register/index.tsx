import { history, Link, useModel } from '@umijs/max';
import React, { useState } from 'react';
import { flushSync } from 'react-dom';
import { login, register } from '@/services/api/authentication';
import { setLoginDisplayName } from '@/utils/displayUserName';
import { getNotebookIdFormatError } from '@/utils/notebookUserProfile';
import PrivacyPolicyModal from '../components/PrivacyPolicyModal';
import UserAgreementModal from '../components/UserAgreementModal';
import '../auth.less';

/** 从 umi/axios 抛错中取出可读文案，便于按「用户名已被占用 / 密码过短 / …」分类展示 */
function getRegisterErrorMessage(err: unknown): string {
  if (err === undefined || err === null) return '注册失败，请稍后重试';
  if (typeof err === 'object') {
    const o = err as { info?: { message?: string }; name?: string };
    if (o.info?.message) return o.info.message;
  }
  if (err instanceof Error) {
    const m = err.message || '';
    if (/network/i.test(m) || m === 'Network Error') return '网络异常，请检查网络后重试';
    if (m && m !== 'Request failed') return m;
  }
  return '注册失败，请稍后重试';
}

const Register: React.FC = () => {
  // 注册页状态包含：账号密码输入、协议勾选与提示信息。
  const { initialState, setInitialState } = useModel('@@initialState');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'info' | 'error' } | null>(null);

  const showMessage = (text: string, type: 'info' | 'error') => setMsg({ text, type });

  const fetchUserInfo = async (): Promise<API.Token | undefined> => {
    // 注册后自动登录时复用全局用户信息拉取流程。
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

  const [loading, setLoading] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const onRegister = async () => {
    // 注册主流程：本地校验 -> 提交注册 -> 尝试自动登录。
    const user = username.trim();
    if (!user) {
      showMessage('请设置用户名', 'error');
      return;
    }
    const nameErr = getNotebookIdFormatError(user);
    if (nameErr) {
      showMessage(nameErr, 'error');
      return;
    }
    if (password.length < 6) {
      showMessage('密码长度至少为 6 位', 'error');
      return;
    }
    if (password !== password2) {
      showMessage('两次输入的密码不一致', 'error');
      return;
    }
    if (!agree) {
      showMessage('请勾选同意用户协议与隐私政策', 'error');
      return;
    }
    setLoading(true);
    try {
      const userId = await register(
        {
          username: user,
          password,
          confirmPassword: password2,
          agreeToTerms: agree,
        },
        { throwError: true, skipErrorHandler: true },
      );
      if (userId === null || userId === undefined) {
        showMessage('注册失败，未收到服务器结果，请稍后重试。', 'error');
        return;
      }
      const loginResult = await login({ userId: user, password });
      if (!loginResult || (loginResult as API.LoginResult).status === 'error') {
        showMessage(`注册成功！用户名：${user}。请返回登录页手动登录。`, 'info');
        return;
      }
      const tok = loginResult as API.Token;
      // 显示名与登录页保持一致，优先使用服务端 userCode。
      setLoginDisplayName((tok.userCode && tok.userCode.trim()) || user);
      const userInfo = await fetchUserInfo();
      if (userInfo) {
        const { applyNotebookProfileFromToken } = await import('@/utils/notebookUserProfile');
        applyNotebookProfileFromToken(userInfo);
      }
      showMessage(`注册成功，已自动登录：${user}`, 'info');
      history.push('/notebook/note');
    } catch (e: unknown) {
      showMessage(getRegisterErrorMessage(e), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="nb-auth-root nb-auth-register">
      <div className="nb-auth-container">
        <div className="nb-auth-left">
          <div>
            <h1>创建新账号</h1>
            <p>
              山东大学崇新学堂开放性创新实践I软件部分课程设计
              <br />
              <br />
              注册后即可使用笔记与分类等功能
            </p>
          </div>
        </div>

        <div className="nb-auth-right">
          <div className="nb-auth-form-wrap">
            <h2>新建账号</h2>
            <div
              className="nb-auth-subtitle nb-auth-subtitle--spacer"
              aria-hidden="true"
            />

            <div className="nb-auth-field">
              <label htmlFor="nb-reg-user">用户名</label>
              <input
                id="nb-reg-user"
                type="text"
                autoComplete="username"
                placeholder="请输入6-20位字符的用户名，以英文字母开头"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="nb-auth-field">
              <label htmlFor="nb-reg-pass">密码</label>
              <input
                id="nb-reg-pass"
                type="password"
                autoComplete="new-password"
                placeholder="至少 6 位字符"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="nb-auth-field">
              <label htmlFor="nb-reg-pass2">确认密码</label>
              <input
                id="nb-reg-pass2"
                type="password"
                autoComplete="new-password"
                placeholder="请再次输入密码"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
              />
            </div>

            <div className="nb-auth-row" style={{ marginBottom: 18 }}>
              <label className="nb-auth-remember">
                <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  我已阅读并同意{' '}
                  <button type="button" className="nb-auth-link-btn" onClick={() => setAgreementOpen(true)}>
                    用户协议
                  </button>{' '}
                  与{' '}
                  <button type="button" className="nb-auth-link-btn" onClick={() => setPrivacyOpen(true)}>
                    隐私政策
                  </button>
                </span>
              </label>
            </div>

            <button type="button" className="nb-auth-submit" disabled={loading} onClick={() => void onRegister()}>
              {loading ? '注册中…' : '完成注册'}
            </button>

            {msg && <div className={`nb-auth-message ${msg.type}`}>{msg.text}</div>}

            <div className="nb-auth-bottom">
              已有账号？
              <Link to="/notebook/login" className="nb-auth-link-btn" style={{ marginLeft: 4 }}>
                立即登录
              </Link>
            </div>
          </div>
        </div>
      </div>
      <UserAgreementModal open={agreementOpen} onClose={() => setAgreementOpen(false)} />
      <PrivacyPolicyModal open={privacyOpen} onClose={() => setPrivacyOpen(false)} />
    </div>
  );
};

export default Register;
