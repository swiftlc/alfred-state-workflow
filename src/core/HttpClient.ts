import axios, {type AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse} from 'axios';
import Logger from './Logger';

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
          `[HTTP Response] ${response.config.method?.toUpperCase()} ${response.config.url} - Status: ${response.status}`
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
}

export const http = new HttpClient();
export { HttpClient };

