import axios from 'axios';

const api = axios.create({
  baseURL: process.env.API_BASE_URL ?? '',
});

api.defaults.timeout = 10000;

api.interceptors.response.use(
  response => response.data,
  err => {
    const isNetworkError =
      !err.response ||
      err.code === 'ERR_NETWORK' ||
      err.message?.includes('Network Error') ||
      err.message?.includes('ERR_CONNECTION_REFUSED') ||
      err.response?.status === 502 ||
      err.response?.status === 503 ||
      err.response?.status === 504;
    if (isNetworkError) {
      console.debug('[ctx-axios] Backend offline, returning silent fallback for:', err.config?.url);
      return Promise.resolve({ success: true, data: [] });
    }
    return Promise.reject(err);
  },
);

export default api;
