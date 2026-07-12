// Config helper to resolve API and WebSocket URLs from environment variables or fallbacks
export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return envUrl;
  }
  // Default dynamic fallback to localhost:8000 in dev
  const protocol = window.location.protocol;
  const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
  return `${protocol}//${host}`;
};

export const getWsUrl = (): string => {
  const envUrl = import.meta.env.VITE_WS_URL;
  if (envUrl) {
    return envUrl;
  }
  // Default dynamic fallback to localhost:8000 in dev
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname === 'localhost' ? 'localhost:8000' : window.location.host;
  return `${protocol}//${host}`;
};
