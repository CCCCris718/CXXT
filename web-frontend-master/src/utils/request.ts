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
  if (!options['throwError']) {
    try {
      const resp: any = await umiRequest(url, options);
      return unwrapServiceResponse<T>(resp);
    } catch (ex) {
      return undefined;
    }
  }
  const resp: any = await umiRequest(url, options);
  return unwrapServiceResponse<T>(resp);
}

export function convertPageData(result: any) {
  return {
    data: result?.list || [],
    total: result?.total || 0,
    success: true,
  };
}
export function orderBy(sort: any) {
  if (!sort) return;
  const keys = Object.keys(sort);
  if (keys.length !== 1) return;
  return keys[0] + ' ' + sort[keys[0]];
}

export async function waitTime(time: number = 100) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(true);
    }, time);
  });
}
