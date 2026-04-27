import { APP_LOGIN_PATH } from '@/constants/auth';
import {
  changeNotebookLoginId,
  changeNotebookPassword,
  verifyNotebookCurrentPassword,
} from '@/services/api/authentication';
import { getNotebookLoginKey, setLoginDisplayName } from '@/utils/displayUserName';
import { applyNotebookProfileFromToken, getNotebookIdFormatError, migrateProfileLoginKey } from '@/utils/notebookUserProfile';
import { migrateLocalNotebookStorageOnLoginIdChange } from '../note/storage';
import { history, useModel } from '@umijs/max';
import { Button, Card, Input, Modal, message } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import NotebookWorkspace from '../components/NotebookWorkspace';
import './index.less';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function msUntilNextIdChange(t?: API.Token): number {
  if (!t?.notebookIdLastChangedAt) return 0;
  const last = new Date(t.notebookIdLastChangedAt).getTime();
  if (Number.isNaN(last)) return 0;
  return Math.max(0, last + THIRTY_DAYS_MS - Date.now());
}

const ProfilePage: React.FC = () => {
  const { initialState, setInitialState } = useModel('@@initialState');
  const token = initialState?.currentToken;
  const loginKey = useMemo(() => (token ? getNotebookLoginKey(token) : ''), [token]);
  const username = useMemo(
    () => (token as API.Token | undefined)?.userCode || loginKey || '—',
    [token, loginKey],
  );

  const canChangeUsername = useMemo(() => !token || msUntilNextIdChange(token) === 0, [token]);
  const nextUsernameChangeHint = useMemo(() => {
    if (!token?.notebookIdLastChangedAt || canChangeUsername) return null;
    return new Date(Date.now() + msUntilNextIdChange(token)).toLocaleString();
  }, [token, canChangeUsername]);

  const [idModalOpen, setIdModalOpen] = useState(false);
  const [idDraft, setIdDraft] = useState('');
  const [passDraft, setPassDraft] = useState('');
  const [changingId, setChangingId] = useState(false);

  const [pwdStep, setPwdStep] = useState<1 | 2>(1);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmNewPwd, setConfirmNewPwd] = useState('');
  const [pwdVerifying, setPwdVerifying] = useState(false);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  useEffect(() => {
    if (!token || !loginKey) {
      history.replace(APP_LOGIN_PATH);
    }
  }, [token, loginKey]);

  const resetPwdForm = () => {
    setPwdStep(1);
    setOldPwd('');
    setNewPwd('');
    setConfirmNewPwd('');
  };

  const onVerifyOldPassword = async () => {
    const p = oldPwd.trim();
    if (!p) {
      message.warning('请输入当前密码');
      return;
    }
    setPwdVerifying(true);
    try {
      await verifyNotebookCurrentPassword({ password: p });
      message.success('验证通过，请设置新密码');
      setPwdStep(2);
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '验证失败');
    } finally {
      setPwdVerifying(false);
    }
  };

  const openUsernameModal = () => {
    if (!canChangeUsername) {
      message.info(`请于 ${nextUsernameChangeHint} 之后再次修改用户名`);
      return;
    }
    setIdDraft((token as API.Token)?.userCode || '');
    setPassDraft('');
    setIdModalOpen(true);
  };

  const saveUsernameFromModal = async () => {
    if (!loginKey) return;
    const v = idDraft.trim();
    if (!v) {
      message.warning('请输入新用户名');
      return;
    }
    const nameErr = getNotebookIdFormatError(v);
    if (nameErr) {
      message.warning(nameErr);
      return;
    }
    if (!passDraft) {
      message.warning('请输入当前密码以确认');
      return;
    }
    setChangingId(true);
    try {
      const oldK = getNotebookLoginKey(token as API.Token);
      const nextTok = await changeNotebookLoginId({ newNotebookId: v, password: passDraft });
      if (nextTok) {
        const newK = (nextTok.userCode || v).trim();
        migrateLocalNotebookStorageOnLoginIdChange(oldK, newK);
        migrateProfileLoginKey(oldK, newK);
        setLoginDisplayName(newK);
        setInitialState((s) => ({ ...s, currentToken: nextTok }));
        applyNotebookProfileFromToken(nextTok);
        setIdModalOpen(false);
        message.success('用户名已更新');
        window.setTimeout(() => window.location.reload(), 300);
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '修改失败');
    } finally {
      setChangingId(false);
    }
  };

  const onSubmitNewPassword = async () => {
    const o = oldPwd.trim();
    const n = newPwd;
    const c = confirmNewPwd;
    if (!n || !c) {
      message.warning('请填写新密码并再次确认');
      return;
    }
    if (n.length < 6) {
      message.warning('新密码长度不能少于 6 位');
      return;
    }
    if (n !== c) {
      message.warning('两次输入的新密码不一致');
      return;
    }
    setPwdSubmitting(true);
    try {
      await changeNotebookPassword({ oldPassword: o, newPassword: n, confirmNewPassword: c });
      message.success('密码已更新');
      resetPwdForm();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '修改失败');
    } finally {
      setPwdSubmitting(false);
    }
  };

  if (!token || !loginKey) {
    return null;
  }

  return (
    <NotebookWorkspace>
      <h1 className="nb-ws-title nb-profile-title">个人中心</h1>

      <Card bordered={false} className="nb-ws-card nb-profile-card">
        <div className="nb-profile-username-block">
          <div className="nb-profile-username-label">用户名</div>
          <div className="nb-profile-username-value">{username}</div>
          {nextUsernameChangeHint && !canChangeUsername ? (
            <div className="nb-profile-username-cooldown">下次可改时间：{nextUsernameChangeHint}</div>
          ) : null}
          <div className="nb-profile-username-actions">
            <Button type="primary" size="large" disabled={!canChangeUsername} onClick={openUsernameModal}>
              修改用户名
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title={<span className="nb-profile-card-title-text">修改密码</span>}
        bordered={false}
        className="nb-ws-card nb-profile-card nb-profile-card--section"
        style={{ marginTop: 20 }}
      >
        <div className="nb-profile-pwd">
          {pwdStep === 1 ? (
            <>
              <div className="nb-profile-pwd-row">
                <span className="nb-profile-pwd-label">当前密码</span>
                <Input.Password
                  size="large"
                  className="nb-profile-pwd-input"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="输入当前密码"
                  autoComplete="current-password"
                />
              </div>
              <div className="nb-profile-pwd-actions">
                <Button type="primary" size="large" loading={pwdVerifying} onClick={() => void onVerifyOldPassword()}>
                  验证并继续
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="nb-profile-pwd-row">
                <span className="nb-profile-pwd-label">新密码</span>
                <Input.Password
                  size="large"
                  className="nb-profile-pwd-input"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="新密码，至少 6 位"
                  autoComplete="new-password"
                />
              </div>
              <div className="nb-profile-pwd-row">
                <span className="nb-profile-pwd-label">确认新密码</span>
                <Input.Password
                  size="large"
                  className="nb-profile-pwd-input"
                  value={confirmNewPwd}
                  onChange={(e) => setConfirmNewPwd(e.target.value)}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                />
              </div>
              <div className="nb-profile-pwd-actions">
                <Button size="large" onClick={resetPwdForm}>
                  上一步
                </Button>
                <Button type="primary" size="large" loading={pwdSubmitting} onClick={() => void onSubmitNewPassword()}>
                  确认修改密码
                </Button>
              </div>
            </>
          )}
        </div>
      </Card>

      <Modal
        title="修改用户名"
        open={idModalOpen}
        onCancel={() => setIdModalOpen(false)}
        onOk={() => void saveUsernameFromModal()}
        okText="确认修改"
        cancelText="取消"
        confirmLoading={changingId}
        destroyOnClose
      >
        <p className="nb-profile-modal-lead">新用户名全站不可与他人重复。修改后请使用新用户名登录。距离上次修改需满 30 天方可再次修改。</p>
        <div className="nb-profile-modal-field-label">新用户名</div>
        <Input
          value={idDraft}
          onChange={(e) => setIdDraft(e.target.value)}
          placeholder="6–20 位，以字母开头"
          autoComplete="off"
        />
        <div className="nb-profile-modal-field-label" style={{ marginTop: 14 }}>当前密码</div>
        <Input.Password
          value={passDraft}
          onChange={(e) => setPassDraft(e.target.value)}
          placeholder="用于确认身份"
          autoComplete="current-password"
        />
      </Modal>
    </NotebookWorkspace>
  );
};

export default ProfilePage;
