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
  TodayTasksResponse,
  Project,
  ProjectCompletionChecklist,
  DependencyBoardResponse,
  WeeklyReport,
  ProjectTemplate,
  NotificationItem,
} from '@/types';

const API_BASE = '';

type TaskPayload = {
  title: string;
  assignee_ids?: number[];
  priority?: 'low' | 'medium' | 'high';
  project?: string;
  project_id?: number | null;
  due_date?: string;
  notes?: string;
};

type TaskUpdatePayload = Partial<TaskPayload> & {
  completed?: boolean;
  status?: 'todo' | 'in_progress' | 'done';
};

type BulkTaskUpdatePayload = {
  priority?: 'low' | 'medium' | 'high';
  project?: string;
  project_id?: number | null;
  completed?: boolean;
  status?: 'todo' | 'in_progress' | 'done';
};

type ProjectPayload = {
  name: string;
  description?: string;
  color?: string;
  archived?: boolean;
  member_ids?: number[];
};

type UserCreatePayload = {
  username: string;
  password: string;
  email: string;
  role: 'admin' | 'user';
};

const ERROR_FIELD_LABELS: Record<string, string> = {
  username: 'Nazwa użytkownika',
  password: 'Hasło',
  email: 'E-mail',
  accept_terms: 'Regulamin',
  accept_privacy: 'Polityka prywatności',
  accept_marketing: 'Zgoda marketingowa',
  role: 'Rola',
  _schema: 'Formularz',
};

function formatErrorValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(formatErrorValue).filter(Boolean).join(', ');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([field, fieldError]) => {
        const label = ERROR_FIELD_LABELS[field] ?? field;
        const message = formatErrorValue(fieldError);
        return message ? `${label}: ${message}` : label;
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function getErrorMessage(errorBody: unknown, status: number): string {
  if (errorBody && typeof errorBody === 'object') {
    const body = errorBody as { error?: unknown; message?: unknown };
    return formatErrorValue(body.error ?? body.message) || `HTTP ${status}`;
  }
  return formatErrorValue(errorBody) || `HTTP ${status}`;
}

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
    throw new Error(getErrorMessage(error, response.status));
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
    signup: (data: {
      username: string;
      password: string;
      email: string;
      accept_terms: boolean;
      accept_privacy: boolean;
      accept_marketing: boolean;
    }) =>
      request<{ message: string; user: User }>('/auth/signup', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    logout: () =>
      request<{ message: string }>('/auth/logout', { method: 'POST' }),
    me: () => request<User>('/auth/me'),
  },

  users: {
    getAll: () => request<{ users: User[] }>('/users'),
    create: (data: UserCreatePayload) =>
      request<{ message: string; user: User }>('/users', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateRole: (userId: number, role: 'admin' | 'user') =>
      request<{ message: string }>(`/users/${userId}/role`, {
        method: 'PUT',
        body: JSON.stringify({ role }),
      }),
    delete: (userId: number) =>
      request<{ message: string }>(`/users/${userId}`, { method: 'DELETE' }),
  },

  tasks: {
    getAll: (page = 1, perPage = 50) =>
      request<PaginationResponse<Task>>(`/tasks?page=${page}&per_page=${perPage}`),
    blocked: () => request<{ tasks: Task[]; total: number }>('/tasks/blocked'),
    dependencyBoard: () => request<DependencyBoardResponse>('/tasks/dependency-board'),
    today: () => request<TodayTasksResponse>('/tasks/today'),
    byProject: () => request<Record<string, Task[]>>('/tasks/by-project'),
    create: (data: TaskPayload) =>
      request<Task>('/tasks', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    quickAdd: (text: string) =>
      request<{ task: Task; parsed: Record<string, unknown> }>('/tasks/quick-add', {
        method: 'POST',
        body: JSON.stringify({ text }),
      }),
    update: (id: number, data: TaskUpdatePayload) =>
      request<Task>(`/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    delete: (id: number) =>
      request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' }),
    complete: (id: number) =>
      request<Task>(`/tasks/${id}/complete`, { method: 'PUT' }),
    addDependency: (id: number, dependsOnTaskId: number) =>
      request<Task>(`/tasks/${id}/dependencies`, {
        method: 'POST',
        body: JSON.stringify({ depends_on_task_id: dependsOnTaskId }),
      }),
    removeDependency: (dependencyId: number) =>
      request<Task>(`/dependencies/${dependencyId}`, { method: 'DELETE' }),
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
    bulkUpdate: (taskIds: number[], updates: BulkTaskUpdatePayload) =>
      request<{ message: string }>('/tasks/bulk/update', {
        method: 'PUT',
        body: JSON.stringify({ task_ids: taskIds, updates }),
      }),
  },

  projects: {
    getAll: () => request<{ projects: Project[] }>('/projects'),
    templates: () => request<{ templates: ProjectTemplate[] }>('/project-templates'),
    useTemplate: (templateId: string, name?: string, startDate?: string) =>
      request<Project>(`/project-templates/${templateId}/use`, {
        method: 'POST',
        body: JSON.stringify({ name, start_date: startDate || undefined }),
      }),
    create: (data: ProjectPayload) =>
      request<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: number, data: Partial<ProjectPayload>) =>
      request<Project>(`/projects/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    completion: (id: number) =>
      request<ProjectCompletionChecklist>(`/projects/${id}/completion`),
    complete: (id: number) =>
      request<Project & { completion: ProjectCompletionChecklist }>(`/projects/${id}/complete`, { method: 'POST' }),
    archive: (id: number) =>
      request<Project>(`/projects/${id}`, { method: 'DELETE' }),
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
    weekly: () => request<WeeklyReport>('/reports/weekly'),
  },

  activity: {
    getAll: (limit = 50) =>
      request<{ activity: ActivityLog[] }>(`/activity?limit=${limit}`),
    getForTask: (taskId: number) =>
      request<{ activity: ActivityLog[] }>(`/tasks/${taskId}/activity`),
  },

  notifications: {
    getAll: (limit = 20, unreadOnly = false) =>
      request<{ notifications: NotificationItem[]; unread_count: number }>(
        `/notifications?limit=${limit}&unread_only=${unreadOnly ? 'true' : 'false'}`,
      ),
    markRead: (id: number) =>
      request<NotificationItem>(`/notifications/${id}/read`, { method: 'POST' }),
    markAllRead: () =>
      request<{ message: string; unread_count: number }>('/notifications/read-all', { method: 'POST' }),
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
