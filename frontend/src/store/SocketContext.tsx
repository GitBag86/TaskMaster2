import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useToast } from './ToastContext'
import { useAuth } from './AuthContext'
import type { Task } from '@/types'

interface TaskEvent {
  action: string;
  user: string;
  timestamp: string;
  task_id?: number;
  task?: Task;
  task_ids?: number[];
}

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  lastTaskEvent: TaskEvent | null;
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false, lastTaskEvent: null });

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastTaskEvent, setLastTaskEvent] = useState<TaskEvent | null>(null);
  const { addToast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('task_action', (data: TaskEvent) => {
      setLastTaskEvent(data);
      if (data.user !== user?.username) {
        addToast(`${data.user} zmienił(a) zadanie`, 'info');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket: socketRef.current, connected, lastTaskEvent }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
