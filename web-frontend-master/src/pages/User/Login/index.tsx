import Footer from '@/components/Footer';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { LoginForm, ProFormCheckbox, ProFormText } from '@ant-design/pro-components';
import { useEmotionCss } from '@ant-design/use-emotion-css';
import { FormattedMessage, history, SelectLang, useIntl, useModel, Helmet } from '@umijs/max';
import { ConfigProvider, message } from 'antd';
import Settings from '../../../../config/defaultSettings';
import React from 'react';
import './index.less';
import { flushSync } from 'react-dom';
import { adminLogin } from '@/services/api/authentication';
import { setLoginDisplayName } from '@/utils/displayUserName';

const Lang = () => {
  const langClassName = useEmotionCss(({ token }) => {
    return {
      width: 42,
      height: 42,
      lineHeight: '42px',
      position: 'fixed',
      right: 16,
      borderRadius: token.borderRadius,
      ':hover': {
        backgroundColor: token.colorBgTextHover,
      },
    };
  });

  return (
    <div className={langClassName} data-lang>
      {SelectLang && <SelectLang />}
    </div>
  );
};

const Login: React.FC = () => {
  const { initialState, setInitialState } = useModel('@@initialState');

  /** 暖色纸感底，与笔记本登录区一致 */
  const containerClassName = useEmotionCss(() => {
    return {
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      overflow: 'auto',
      background: 'linear-gradient(180deg, #f8f9fa 0%, #f1f5f9 38%, #ffffff 100%)',
    };
  });

  const mainClassName = useEmotionCss(() => {
    return {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 16px 32px',
      width: '100%',
    };
  });

  const intl = useIntl();

  const fetchUserInfo = async () => {
    // 管理端登录后复用全局用户信息拉取逻辑。
    const userInfo = await initialState?.fetchUserInfo?.();
    if (userInfo) {
      flushSync(() => {
        setInitialState((s) => ({
          ...s,
          currentToken: userInfo,
        }));
      });
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      // 登录主流程：认证 -> 会话同步 -> 跳转目标页。
      const msg = await adminLogin({ userId: values.username!, password: values.password! });
      if (!msg) {
        message.error(
          intl.formatMessage({
            id: 'pages.login.networkError',
            defaultMessage:
              '登录请求失败（网络异常或未连接后端）。使用 Mock 时不要设置 BACKEND_PROXY_TARGET；连后端时请启动服务并设置该变量。',
          }),
        );
        return;
      }
      if ((msg as API.LoginResult).status === 'error') {
        message.error(
          intl.formatMessage({
            id: 'pages.login.failure',
            defaultMessage: '登录失败，请重试！',
          }),
        );
        return;
      }

      const defaultLoginSuccessMessage = intl.formatMessage({
        id: 'pages.login.success',
        defaultMessage: '登录成功！',
      });
      message.success(defaultLoginSuccessMessage);
      // 管理端同样记录登录名，保证右上角及侧栏展示一致。
      setLoginDisplayName(String(values.username).trim());
      await fetchUserInfo();
      const urlParams = new URL(window.location.href).searchParams;
      history.push(urlParams.get('redirect') || '/');
      return;
    } catch (error: any) {
      const defaultLoginFailureMessage = intl.formatMessage({
        id: 'pages.login.failure',
        defaultMessage: '登录失败，请重试！',
      });
      message.error(error?.message || defaultLoginFailureMessage);
    }
  };

  return (
    <div className={`${containerClassName} user-login-root`}>
      <Helmet>
        <title>
          {intl.formatMessage({
            id: 'menu.login',
            defaultMessage: '登录页',
          })}
          - {Settings.title}
        </title>
      </Helmet>
      <Lang />
      <div className={mainClassName}>
        <ConfigProvider
          theme={{
            token: {
              colorPrimary: '#34495e',
              borderRadius: 12,
            },
          }}
        >
          <LoginForm
            containerStyle={{
              flex: '0 0 auto',
              height: 'auto',
              minHeight: 0,
            }}
            contentStyle={{
              minWidth: 280,
              maxWidth: 368,
              width: '100%',
            }}
            logo={<img alt="logo" src="/logo.svg" style={{ height: 44 }} />}
            title="Ant Design"
            subTitle={intl.formatMessage({ id: 'pages.layouts.userLayout.title' })}
            initialValues={{
              autoLogin: true,
            }}
            submitter={{
              searchConfig: {
                submitText: intl.formatMessage({ id: 'pages.login.submit', defaultMessage: '登录' }),
              },
            }}
            onFinish={async (values) => {
              await handleSubmit(values);
            }}
          >
          <ProFormText
            name="username"
            fieldProps={{
              size: 'large',
              prefix: <UserOutlined />,
            }}
            placeholder={intl.formatMessage({
              id: 'pages.login.username.placeholder',
              defaultMessage: '用户名: admin or user',
            })}
            rules={[
              {
                required: true,
                message: (
                  <FormattedMessage
                    id="pages.login.username.required"
                    defaultMessage="请输入用户名!"
                  />
                ),
              },
            ]}
          />
          <ProFormText.Password
            name="password"
            fieldProps={{
              size: 'large',
              prefix: <LockOutlined />,
              visibilityToggle: true,
            }}
            placeholder={intl.formatMessage({
              id: 'pages.login.password.placeholder',
              defaultMessage: '密码: ant.design',
            })}
            rules={[
              {
                required: true,
                message: (
                  <FormattedMessage
                    id="pages.login.password.required"
                    defaultMessage="请输入密码！"
                  />
                ),
              },
            ]}
          />

          <div
            style={{
              marginBottom: 24,
            }}
          >
            <ProFormCheckbox noStyle name="autoLogin">
              <FormattedMessage id="pages.login.rememberMe" defaultMessage="自动登录" />
            </ProFormCheckbox>
            <a
              style={{
                float: 'right',
              }}
              onClick={(e) => e.preventDefault()}
            >
              <FormattedMessage id="pages.login.forgotPassword" defaultMessage="忘记密码？" />
            </a>
          </div>
        </LoginForm>
        </ConfigProvider>
      </div>
      <Footer />
    </div>
  );
};

export default Login;
