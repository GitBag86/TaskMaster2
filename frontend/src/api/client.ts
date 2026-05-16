import type {
  User,
  Task,
  Comment,
  Subtask,
  ActivityLog,
  DashboardStats,
  Tag,
  SavedFilter,
  TaskTemplate,
  PaginationResponse,
} from '@/types';

const API_BASE = '';

async function request<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<{ message: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      }),
    signup: (username: string, password: string, email?: string) =>
      request<{ message: string; user: User }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ username, password, email }),
      }),
    logout: () =>
      request<{ message: string }>('/auth/logout', { method: 'POST' }),
    me: () => request<User>('/auth/me'),
  },

  users: {
    getAll: () => request<{ users: User[] }>('/users'),
    updateRole: (userId: number, role: 'admin' | 'user') =>
      request<{ message: string }>(`/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
  },

  tasks: {
    getAll: (page = 1, perPage = 50) =>
      request<PaginationResponse<Task>>(`/tasks?page=${page}&per_page=${perPage}`),
    create: (data: {
      title: string;
      assigned_to?: string;
      priority?: string;
      project?: string;
      due_date?: string;
      notes?: string;
    }) =>
      request<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<Task>) =>
      request<Task>(`/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' }),
    complete: (id: number) =>
      request<Task>(`/tasks/${id}/complete`, { method: 'PUT' }),
    search: (q: string) =>
      request<{ tasks: Task[] }>(`/tasks/search?q=${encodeURIComponent(q)}`),
    filter: (params: Record<string, string>) => {
      const qs = new URLSearchParams(params).toString();
      return request<{ tasks: Task[] }>(`/tasks/filter?${qs}`);
    },
    bulkComplete: (taskIds: number[]) =>
      request<{ message: string }>('/tasks/bulk/complete', {
        method: 'PUT',
        body: JSON.stringify({ task_ids: taskIds }),
      }),
    bulkDelete: (taskIds: number[]) =>
      request<{ message: string }>('/tasks/bulk/delete', {
        method: 'DELETE',
        body: JSON.stringify({ task_ids: taskIds }),
      }),
    bulkUpdate: (taskIds: number[], updates: Record<string, string>) =>
      request<{ message: string }>('/tasks/bulk/update', {
        method: 'PUT',
        body: JSON.stringify({ task_ids: taskIds, updates }),
      }),
  },

  comments: {
    add: (taskId: number, text: string) =>
      request<Comment>(`/tasks/${taskId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
  },

  subtasks: {
    add: (taskId: number, title: string) =>
      request<Subtask>(`/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    complete: (id: number) =>
      request<Subtask>(`/subtasks/${id}/complete`, { method: 'PUT' }),
    delete: (id: number) =>
      request<{ message: string }>(`/subtasks/${id}`, { method: 'DELETE' }),
  },

  stats: {
    dashboard: () => request<DashboardStats>('/stats/dashboard'),
  },

  activity: {
    getAll: (limit = 50) =>
      request<{ activity: ActivityLog[] }>(`/activity?limit=${limit}`),
  },

  tags: {
    getAll: () => request<{ tags: Tag[] }>('/tags'),
    create: (name: string, color: string) =>
      request<Tag>('/tags', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/tags/${id}`, { method: 'DELETE' }),
  },

  filters: {
    getAll: () => request<{ filters: SavedFilter[] }>('/filters'),
    create: (name: string, filters: Record<string, string>) =>
      request<SavedFilter>('/filters', {
        method: 'POST',
        body: JSON.stringify({ name, filters }),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/filters/${id}`, { method: 'DELETE' }),
  },

  templates: {
    getAll: () => request<{ templates: TaskTemplate[] }>('/templates'),
    create: (name: string, description: string, templateData: Record<string, unknown>) =>
      request<TaskTemplate>('/templates', {
        method: 'POST',
        body: JSON.stringify({ name, description, template_data: templateData }),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/templates/${id}`, { method: 'DELETE' }),
    use: (id: number) =>
      request<Task>(`/templates/${id}/use`, { method: 'POST' }),
  },
};
