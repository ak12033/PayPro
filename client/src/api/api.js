import axios from 'axios';

const api = axios.create({
    baseURL: `${import.meta.env.VITE_BACKEND_URL}/api`,
    withCredentials: true
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.request.use((config) => {
    const token = window.accessToken; 
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

api.interceptors.response.use((response) => response, async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
        if (isRefreshing) {
            return new Promise(function(resolve, reject) {
                failedQueue.push({ resolve, reject });
            }).then(token => {
                originalRequest.headers.Authorization = 'Bearer ' + token;
                return api(originalRequest);
            }).catch(err => Promise.reject(err));
        }

        originalRequest._retry = true;
        isRefreshing = true;

        try {
            const { data } = await axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/auth/refresh`, {
                withCredentials: true 
            });

            const newAccessToken = data.accessToken;
            window.accessToken = newAccessToken;
            
            processQueue(null, newAccessToken);
            originalRequest.headers.Authorization = 'Bearer ' + newAccessToken;
            
            return api(originalRequest);
        } catch (refreshError) {
            processQueue(refreshError, null);
            window.accessToken = null;
            // Optionally dispatch a custom event here to let AuthContext know
            window.dispatchEvent(new Event('auth-expired'));
            return Promise.reject(refreshError);
        } finally {
            isRefreshing = false;
        }
    }

    return Promise.reject(error);
});

export default api;
