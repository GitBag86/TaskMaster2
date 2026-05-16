export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  assigned_to: string;
  priority: 'low' | 'medium' | 'high';
  project: string;
  due_date: string | null;
  notes: string;
  completed: boolean;
  status: 'todo' | 'in_progress' | 'done';
  comments: Comment[];
  subtasks: Subtask[];
  created_at: string;
}

export interface Comment {
  id: number;
  author: string;
  text: string;
  created_at: string;
}

export interface Subtask {
  id: number;
  task_id: number;
  title: string;
  completed: boolean;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  task_id: number;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completion_rate: number;
  by_priority: { high: number; medium: number; low: number };
  by_project: Record<string, { total: number; completed: number }>;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface SavedFilter {
  id: number;
  name: string;
  filters: Record<string, string>;
}

export interface TaskTemplate {
  id: number;
  name: string;
  description: string;
  template_data: Record<string, unknown>;
}

export interface PaginationResponse<T> {
  tasks: T[];
  total: number;
  page: number;
  pages: number;
  per_page: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}
