export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'user';
  terms_accepted: boolean;
  privacy_accepted: boolean;
  marketing_consent: boolean;
  consented_at: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  title: string;
  assignees: User[];
  priority: 'low' | 'medium' | 'high';
  project: string;
  project_id: number | null;
  project_info: Project | null;
  due_date: string | null;
  notes: string;
  completed: boolean;
  status: 'todo' | 'in_progress' | 'done';
  comments: Comment[];
  subtasks: Subtask[];
  dependencies: TaskDependency[];
  blocked_by: TaskSummary[];
  blocking: TaskSummary[];
  is_blocked: boolean;
  created_at: string;
}

export interface TaskSummary {
  id: number;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  completed: boolean;
  project: string;
  due_date: string | null;
}

export interface TaskDependency {
  id: number;
  task_id: number;
  depends_on_task_id: number;
  depends_on_task: TaskSummary | null;
  created_at: string | null;
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
  username?: string;
  task_id: number | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Project {
  id: number;
  name: string;
  description: string;
  color: string;
  archived: boolean;
  created_by_id: number | null;
  created_at: string | null;
  tasks?: Task[];
}

export interface ProjectCompletionChecklist {
  ready: boolean;
  checks: {
    all_tasks_done: boolean;
    no_blocked_tasks: boolean;
    no_overdue_tasks: boolean;
  };
  open_tasks: TaskSummary[];
  blocked_tasks: TaskSummary[];
  overdue_tasks: TaskSummary[];
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
  has_next?: boolean;
  has_prev?: boolean;
}

export interface TodayTasksResponse {
  overdue: Task[];
  today: Task[];
  upcoming: Task[];
  counts: {
    overdue: number;
    today: number;
    upcoming: number;
    total: number;
  };
  generated_at: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}
