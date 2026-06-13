import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useToast } from './ToastContext'
import { useAuth } from './AuthContext'
import type { NotificationItem, Task } from '@/types'

interface TaskEvent {
  action: string;
  user: string;
  timestamp: string;
  task_id?: number;
  task?: Task;
  task_ids?: number[];
  mentioned_usernames?: string[];
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  lastTaskEvent: TaskEvent | null;
  lastNotification: NotificationItem | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false, lastTaskEvent: null, lastNotification: null });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTaskEvent, setLastTaskEvent] = useState<TaskEvent | null>(null);
  const [lastNotification, setLastNotification] = useState<NotificationItem | null>(null);
  const { addToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const socketOrigin =
      (import.meta.env.VITE_SOCKET_ORIGIN as string | undefined) ??
      (import.meta.env.VITE_API_BASE as string | undefined) ??
      (import.meta.env.VITE_API_URL as string | undefined) ??
      window.location.origin;

    const socket = io(socketOrigin, {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: true,
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      console.error('[Socket.IO] Connection error:', err.message);
      setConnected(false);
    });

    socket.on('task_action', (data: TaskEvent) => {
      setLastTaskEvent(data);
      if (data.user !== user?.username) {
        if (data.action === 'mentioned' && data.mentioned_usernames?.includes(user?.username ?? '')) {
          addToast(`${data.user} wspomniał(a) Cię w komentarzu`, 'info');
        } else {
          addToast(`${data.user} zmienił(a) zadanie`, 'info');
        }
      }
    });

    socket.on('notification', (notification: NotificationItem) => {
      if (notification.user_id != null && notification.user_id !== user.id) return;
      setLastNotification(notification);
      addToast(notification.message, 'info');
    });

    return () => {
      socket.disconnect();
    };
  }, [addToast, user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, lastTaskEvent, lastNotification }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
