const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

window.APP_CONFIG = {
  API_BASE_URL: isLocal ? 'http://localhost:5000/api' : 'https://mlaahl.online/api'
};
