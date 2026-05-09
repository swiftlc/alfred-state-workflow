import axios, {type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse} from 'axios';
import Logger from './Logger';

/** 代理请求支持的 HTTP 方法 */
type ProxyMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** 代理请求配置（不含 headers，headers 会被合并） */
type ProxyConfig = Omit<AxiosRequestConfig, 'headers'> & {
  headers?: Record<string, string>;
};

/** 代理服务地址 */
const PROXY_BASE_URL = 'http://www.swiftlc.com/api/sso';

/**
 * 统一的 HTTP 请求客户端
 * 封装了 axios，提供默认超时、统一错误处理和日志记录
 */
class HttpClient {
  private client: AxiosInstance;

  constructor(config: AxiosRequestConfig = {}) {
    this.client = axios.create({
      timeout: (config.timeout as number | undefined) ?? 10000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.headers as Record<string, string> | undefined),
      },
      ...config,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        Logger.info(`[HTTP Request] ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params as unknown,
          data: config.data as unknown,
          headers: config.headers as unknown,
        });
        return config;
      },
      (error: Error) => {
        Logger.error('[HTTP Request Error]', error);
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    // axios 拦截器类型不允许直接返回 data，用 as any 绕过
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.client.interceptors.response.use as any)(
      (response: AxiosResponse) => {
        Logger.info(
          `[HTTP Response] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`,
          {
            headers: response.headers as unknown,
            body: response.data as unknown,
          }
        );
        return response.data;
      },
      (error: AxiosError) => {
        const errorInfo = {
          message: error.message,
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data,
        };
        Logger.error('[HTTP Response Error]', error, errorInfo);

        let customMessage = '网络请求失败';
        if (error.response) {
          customMessage = `请求失败 (状态码: ${error.response.status})`;
        } else if (error.request) {
          customMessage = '服务器无响应，请检查网络连接';
        } else {
          customMessage = `请求配置错误: ${error.message}`;
        }

        const customError = Object.assign(new Error(customMessage), {
          originalError: error,
          status: error.response?.status,
          data: error.response?.data,
        });

        return Promise.reject(customError);
      }
    );
  }

  async get<T = unknown>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    return this.client.get<T>(url, config) as Promise<T>;
  }

  async post<T = unknown>(url: string, data: unknown = {}, config: AxiosRequestConfig = {}): Promise<T> {
    return this.client.post<T>(url, data, config) as Promise<T>;
  }

  async put<T = unknown>(url: string, data: unknown = {}, config: AxiosRequestConfig = {}): Promise<T> {
    return this.client.put<T>(url, data, config) as Promise<T>;
  }

  async delete<T = unknown>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
    return this.client.delete<T>(url, config) as Promise<T>;
  }

  /**
   * 通过代理服务发起请求
   *
   * 所有请求统一发往 http://www.swiftlc.com/api/sso，
   * 真实目标地址通过 x-proxy-dest header 透传给代理服务器。
   *
   * @param method   HTTP 方法（GET / POST / PUT / DELETE / PATCH）
   * @param destUrl  真实目标 URL（代理服务会将请求转发到此地址）
   * @param config   可选的 axios 配置（params / data / headers 等），headers 会与代理 header 合并
   */
  async proxy<T = unknown>(method: ProxyMethod, destUrl: string, config: ProxyConfig = {}): Promise<T> {
    const { headers: extraHeaders, ...restConfig } = config;
    const mergedConfig: AxiosRequestConfig = {
      ...restConfig,
      headers: {
        'x-proxy-dest': destUrl,
        ...extraHeaders,
      },
    };

    switch (method) {
      case 'GET':
        return this.get<T>(PROXY_BASE_URL, mergedConfig);
      case 'POST':
        return this.post<T>(PROXY_BASE_URL, restConfig.data, mergedConfig);
      case 'PUT':
        return this.put<T>(PROXY_BASE_URL, restConfig.data, mergedConfig);
      case 'DELETE':
        return this.delete<T>(PROXY_BASE_URL, mergedConfig);
      case 'PATCH':
        return this.client.patch<T>(PROXY_BASE_URL, restConfig.data, mergedConfig) as Promise<T>;
    }
  }
}

export const http = new HttpClient();
export { HttpClient };
export type { ProxyMethod, ProxyConfig };

