const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export const createApiClient = (getToken) => {
  const request = async (path, options = {}) => {
    const token = await getToken();
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers
      }
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    return data;
  };

  return {
    get: (path) => request(path),
    post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
    put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (path) => request(path, { method: 'DELETE' })
  };
};

export const meetingApi = {
  create: (getToken, data) =>
    createApiClient(getToken).post('/meetings', data),
  get: (getToken, meetingId) =>
    createApiClient(getToken).get(`/meetings/${meetingId}`),
  join: (getToken, meetingId, data) =>
    createApiClient(getToken).post(`/meetings/${meetingId}/join`, data),
  leave: (getToken, meetingId) =>
    createApiClient(getToken).post(`/meetings/${meetingId}/leave`, {}),
  end: (getToken, meetingId) =>
    createApiClient(getToken).post(`/meetings/${meetingId}/end`, {}),
  getUserMeetings: (getToken, userId) =>
    createApiClient(getToken).get(`/meetings/user/${userId}`)
};

export const messageApi = {
  getMessages: (getToken, meetingId) =>
    createApiClient(getToken).get(`/messages/${meetingId}`),
  saveMessage: (getToken, data) =>
    createApiClient(getToken).post('/messages', data)
};
