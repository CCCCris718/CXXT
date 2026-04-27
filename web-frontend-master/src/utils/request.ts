import { request as umiRequest } from '@umijs/max';

/** umi 的 request 默认已返回 axios 的 response.data；仅当 body 为 { success, data } 时再取内层 data */
function unwrapServiceResponse<T>(resp: any): T | undefined {
  if (resp === null || resp === undefined) return undefined;
  if (
    typeof resp === 'object' &&
    'success' in resp &&
    'data' in resp &&
    Object.prototype.hasOwnProperty.call(resp, 'data')
  ) {
    return resp.data as T;
  }
  return resp as T;
}

export async function request<T>(
  url: string,
  options: any = { method: 'GET' },
): Promise<T | undefined> {
  // 自定义开关勿传给 umi/axios，避免污染底层配置。
  const throwError = Boolean(options['throwError']);
  const umiOpts = { ...options };
  delete umiOpts.throwError;

  if (!throwError) {
    // 非抛错模式：异常返回 undefined，交由业务层决定兜底逻辑。
    try {
      const resp: any = await umiRequest(url, umiOpts);
      return unwrapServiceResponse<T>(resp);
    } catch (ex) {
      return undefined;
    }
  }
  const resp: any = await umiRequest(url, umiOpts);
  return unwrapServiceResponse<T>(resp);
}

export function convertPageData(result: any) {
  // 将后端分页结构适配为 ProTable 标准格式。
  return {
    data: result?.list || [],
    total: result?.total || 0,
    success: true,
  };
}
export function orderBy(sort: any) {
  // 将排序对象转换为“字段 空格 方向”的后端可读字符串。
  if (!sort) return;
  const keys = Object.keys(sort);
  if (keys.length !== 1) return;
  return keys[0] + ' ' + sort[keys[0]];
}

export async function waitTime(time: number = 100) {
  // 简单延时工具，常用于演示与异步节流测试。
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
}
