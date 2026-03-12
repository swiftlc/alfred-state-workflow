const axios = require('axios');
const Logger = require('./Logger');

/**
 * 统一的 HTTP 请求客户端
 * 封装了 axios，提供默认超时、重试机制、统一的错误处理和日志记录
 */
class HttpClient {
  constructor(config = {}) {
    this.client = axios.create({
      timeout: config.timeout || 10000, // 默认超时 10 秒
      headers: {
        'Content-Type': 'application/json',
        ...config.headers
      },
      ...config
    });

    this.setupInterceptors();
  }

  setupInterceptors() {
    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        // 可以在这里统一添加鉴权 Token 等
        // const token = getAuthToken();
        // if (token) config.headers.Authorization = `Bearer ${token}`;

        Logger.info(`[HTTP Request] ${config.method.toUpperCase()} ${config.url}`, {
          params: config.params,
          data: config.data
        });
        return config;
      },
      (error) => {
        Logger.error('[HTTP Request Error]', error);
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response) => {
        Logger.info(`[HTTP Response] ${response.config.method.toUpperCase()} ${response.config.url} - Status: ${response.status}`);
        // 直接返回 data 部分，简化调用方的处理
        return response.data;
      },
      (error) => {
        const errorInfo = {
          message: error.message,
          url: error.config?.url,
          method: error.config?.method,
          status: error.response?.status,
          data: error.response?.data
        };
        Logger.error('[HTTP Response Error]', error, errorInfo);

        // 抛出更友好的错误信息
        let customMessage = '网络请求失败';
        if (error.response) {
          customMessage = `请求失败 (状态码: ${error.response.status})`;
        } else if (error.request) {
          customMessage = '服务器无响应，请检查网络连接';
        } else {
          customMessage = `请求配置错误: ${error.message}`;
        }

        const customError = new Error(customMessage);
        customError.originalError = error;
        customError.status = error.response?.status;
        customError.data = error.response?.data;

        return Promise.reject(customError);
      }
    );
  }

  // 封装常用的请求方法
  async get(url, config = {}) {
    return this.client.get(url, config);
  }

  async post(url, data = {}, config = {}) {
    return this.client.post(url, data, config);
  }

  async put(url, data = {}, config = {}) {
    return this.client.put(url, data, config);
  }

  async delete(url, config = {}) {
    return this.client.delete(url, config);
  }
}

// 导出一个默认实例，方便直接使用
const defaultClient = new HttpClient();

module.exports = {
  HttpClient,
  http: defaultClient
};

