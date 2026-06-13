import { useToast } from '@/store/ToastContext'

const icons = {
  success: '✓',
  error: '✕',
  warning: '!',
  info: 'i',
};

const colors = {
  success: 'border-l-green-500',
  error: 'border-l-red-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

export function Toaster() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 rounded-lg border border-border border-l-4 ${colors[toast.type]} bg-white px-4 py-3 shadow-lg dark:bg-gray-900`}
        >
          <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
            toast.type === 'success' ? 'bg-green-500' :
            toast.type === 'error' ? 'bg-red-500' :
            toast.type === 'warning' ? 'bg-amber-500' :
            'bg-blue-500'
          }`}>
            {icons[toast.type]}
          </span>
          <span className="text-sm text-gray-900 dark:text-white">{toast.message}</span>
          {toast.action && (
            <button
              onClick={() => { toast.action!.onClick(); removeToast(toast.id); }}
              className="whitespace-nowrap text-sm font-semibold text-primary hover:text-primary/80"
            >
              {toast.action.label}
            </button>
          )}
          <button onClick={() => removeToast(toast.id)} className="ml-2 text-muted-foreground hover:text-gray-900 dark:hover:text-white">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
