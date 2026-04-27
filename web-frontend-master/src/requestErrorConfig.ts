import type { RequestConfig } from '@umijs/max';
import { message, notification } from 'antd';

/** 前端统一错误呈现类型。 */
enum ErrorShowType {
  SILENT = 0,
  WARN_MESSAGE = 1,
  ERROR_MESSAGE = 2,
  NOTIFICATION = 3,
  REDIRECT = 9,
}
/** 与后端约定的响应结构。 */
interface ResponseStructure {
  success: boolean;
  data: any;
  code?: number;
  message?: string;
  showType?: ErrorShowType;
}

/**
 * @name 错误处理
 * pro 自带的错误处理， 可以在这里做自己的改动
 * @doc https://umijs.org/docs/max/request#配置
 */
export const errorConfig: RequestConfig = {
  // 统一错误处理：兼容 Umi request + 业务错误抛出。
  errorConfig: {
    // 将业务失败显式抛出为 BizError，交给 errorHandler 分流处理。
    errorThrower: (res) => {
      const { success, data, code, message, showType } =
        res as unknown as ResponseStructure;
      // 仅当明确 success === false 时视为业务失败（无 success 字段的旧 Mock / 接口不抛错）
      if (success === false) {
        const error: any = new Error(message);
        error.name = 'BizError';
        error.info = { code, message, showType, data };
        throw error;
      }
    },
    // 统一处理业务错误、HTTP 错误与网络错误。
    errorHandler: (error: any, opts: any) => {
      if (opts?.skipErrorHandler) throw error;
      // errorThrower 抛出的业务错误。
      if (error.name === 'BizError') {
        const errorInfo: ResponseStructure | undefined = error.info;
        if (errorInfo) {
          const { message: errorMessage, code: errorCode } = errorInfo;
          switch (errorInfo.showType) {
            case ErrorShowType.SILENT:
              // 静默模式：由调用方自行处理。
              break;
            case ErrorShowType.WARN_MESSAGE:
              message.warning(errorMessage);
              break;
            case ErrorShowType.ERROR_MESSAGE:
              message.error(errorMessage);
              break;
            case ErrorShowType.NOTIFICATION:
              notification.open({
                description: errorMessage,
                message: errorCode,
              });
              break;
            case ErrorShowType.REDIRECT:
              // 预留跳转型错误处理。
              break;
            default:
              message.error(errorMessage);
          }
        }
      } else if (error.response) {
        // 请求已发出且收到响应，但状态码不在 2xx 范围。
        message.error(`Response status:${error.response.status}`);
      } else if (error.request) {
        // 请求已发起但未收到响应。
        message.error('None response! Please retry.');
      } else {
        // 请求构建或发送阶段发生异常。
        message.error('Request error, please retry.');
      }
    },
  },

  // 请求拦截器（按需启用）。
  /*
  requestInterceptors: [
    (config: RequestOptions) => {
      // 拦截请求配置，进行个性化处理。
      const url = config?.url?.concat('?token = 123');
      return { ...config, url };
    },
  ],
  */
};
