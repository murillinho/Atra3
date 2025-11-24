
import React, { createContext, useState, useContext, ReactNode, useEffect, useRef, useCallback } from 'react';
import { Machine, MachineContextType, MachineStatus, StopReason, WorkHoursConfig, MachineHistoryLog, TvConfig, CycleUnit, NotificationType } from '../types';
import { api } from '../services/api';
import { calculateFleetMetrics } from '../utils/analytics';
import { AlertCircle, CheckCircle, Info, X, AlertTriangle } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const MachineContext = createContext<MachineContextType | undefined>(undefined);

const INITIAL_WORK_HOURS: WorkHoursConfig = { enabled: true, start: "08:00", end: "18:49" };
const INITIAL_TV_CONFIG: TvConfig = { intervalSeconds: 15 };
const LAST_RESET_KEY = 'gestao_last_reset_date';

interface NotificationState {
  id: number;
  message: string;
  type: NotificationType;
}

export const MachineProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workHours, setWorkHours] = useState<WorkHoursConfig>(INITIAL_WORK_HOURS);
  const [history, setHistory] = useState<MachineHistoryLog[]>([]);
  const [tvConfig, setTvConfig] = useState<TvConfig>(INITIAL_TV_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true); 
  
  // Notification State
  const [notification, setNotification] = useState<NotificationState | null>(null);
  const notificationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- NOTIFICATION LOGIC ---
  const showNotification = useCallback((message: string, type: NotificationType = 'info') => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    setNotification({ id: Date.now(), message, type });
    notificationTimeoutRef.current = setTimeout(() => setNotification(null), 4000);
  }, []);

  const closeNotification = () => {
    if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
    setNotification(null);
  };

  const sortMachines = (list: Machine[]) => {
    return [...list].sort((a, b) => a.id - b.id);
  };

  // --- LOAD DATA ---
  const loadData = useCallback(async () => {
    try {
      const data = await api.loadFullData();
      if (data) {
        setMachines(sortMachines(data.machines || []));
        setWorkHours(data.workHours || INITIAL_WORK_HOURS);
        setHistory(data.history || []);
        setTvConfig(data.tvConfig || INITIAL_TV_CONFIG);
      }
      setIsLoaded(true);
    } catch (error) {
      console.error("Falha ao carregar dados:", error);
      showNotification("Erro de conexão com o servidor.", 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  // Inicialização Inicial
  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- REALTIME SUBSCRIPTIONS (SYNC AUTOMÁTICO) ---
  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) return;

    // Inscrever para mudanças em todas as tabelas relevantes
    const channel = supabase.channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'machines' },
        (payload) => {
          // Quando houver mudança na tabela machines, recarrega
          // console.log('Realtime Change received:', payload);
          loadData(); 
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'history' },
        (payload) => {
          // Quando novo histórico entrar
          loadData();
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'app_settings' },
        (payload) => {
          // Quando configurações mudarem
          loadData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // --- EXCEL DOWNLOAD LOGIC ---
  const downloadExcelReport = useCallback(() => {
    const metrics = calculateFleetMetrics(machines, history, workHours);
    const headers = ["Maquina", "Status Atual", "Ultimo Motivo", "Qtd Falhas", "Tempo Parado Hoje (ms)", "Tempo Parado Hoje (min)"];
    const rows = metrics.map(m => {
        return [
            m.machineName,
            m.status || 'N/A',
            m.lastReason || 'N/A',
            m.failureCount,
            m.totalDowntimeMs,
            (m.totalDowntimeMs / 60000).toFixed(1)
        ].join(';');
    });
    const csvContent = "\uFEFF" + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `relatorio_paradas_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [machines, history, workHours]);


  // --- ACTIONS ---

  const updateMachineStatus = async (id: number, status: MachineStatus, reason: StopReason | null = null, notes: string = '', operator: string = 'Operador Turno A', signature?: string) => {
    // Optimistic UI Update (Para feedback imediato, o Realtime confirmará depois)
    setMachines(prev => {
      const newList = prev.map(m => m.id === id ? { ...m, status, reason, notes, lastOperator: operator, lastUpdated: new Date().toISOString() } : m);
      return sortMachines(newList);
    });

    try {
      await api.updateStatus(id, status, reason, notes, operator, workHours, signature);
      showNotification(`Status atualizado com sucesso.`, 'success');
    } catch (e) {
      console.error("Erro ao atualizar status:", e);
      showNotification("Erro ao salvar no servidor.", 'error');
      loadData(); // Reverte em caso de erro
    }
  };

  const updateAccumulatedTime = async (id: number, newTimeMs: number) => {
    // Optimistic
    setMachines(prev => sortMachines(prev.map(m => m.id === id ? { ...m, accumulatedDowntimeMs: newTimeMs } : m)));
    try {
      await api.updateAccumulatedTime(id, newTimeMs);
    } catch (e) {
      showNotification("Falha ao salvar ajuste de tempo.", 'error');
    }
  };

  const updateWorkHours = async (config: WorkHoursConfig) => {
    setWorkHours(config);
    try {
      await api.updateConfig(config, undefined);
      showNotification("Horário de turno atualizado.", 'success');
    } catch (e) {
       showNotification("Erro ao salvar configuração.", 'error');
    }
  };

  const updateTvConfig = async (config: TvConfig) => {
    setTvConfig(config);
    try {
      await api.updateConfig(undefined, config);
      showNotification("Configuração de TV salva.", 'success');
    } catch (e) {
      showNotification("Erro ao salvar configuração.", 'error');
    }
  };

  const resetSystem = async () => {
    window.location.reload();
  };

  // --- DAILY RESET LOGIC ---
  useEffect(() => {
    if (!isLoaded) return;
    const checkReset = async () => {
      if (!workHours.enabled) return;
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const lastResetDate = localStorage.getItem(LAST_RESET_KEY);

      if (lastResetDate === todayStr) return;

      const [startH, startM] = workHours.start.split(':').map(Number);
      const shiftStartDate = new Date();
      shiftStartDate.setHours(startH, startM, 0, 0);

      if (now >= shiftStartDate) {
        try {
          const result = await api.resetDaily();
          if (result.machines && result.machines.length > 0) {
            showNotification("Novo turno iniciado. Contadores reiniciados.", 'info');
            localStorage.setItem(LAST_RESET_KEY, todayStr);
            loadData(); // Recarrega dados limpos
          }
        } catch (e) {
          console.error("Erro no reset diário:", e);
        }
      }
    };
    const interval = setInterval(checkReset, 60000);
    checkReset();
    return () => clearInterval(interval);
  }, [isLoaded, workHours, showNotification, loadData]);


  // --- HELPERS ---

  const getMachineById = (id: number) => machines.find((m) => m.id === id);

  const updateProductionData = (id: number, production: number, scrap: number) => {
    // Implementação futura no banco
    setMachines(prev => sortMachines(prev.map(m => m.id === id ? { ...m, productionCount: production, scrapCount: scrap } : m)));
  };

  const updateCycleConfig = (id: number, value: number, unit: CycleUnit) => {
    // Implementação futura no banco
    setMachines(prev => sortMachines(prev.map(m => m.id === id ? { ...m, cycleTimeValue: value, cycleTimeUnit: unit } : m)));
  };

  const generateMockData = () => {
    showNotification("Atenção: Dados são gerenciados pelo Banco de Dados.", 'warning');
  };

  const exportData = (): string => {
    const data = { timestamp: new Date().toISOString(), machines, workHours, history, tvConfig };
    return JSON.stringify(data, null, 2);
  };

  const importData = (json: string): boolean => {
    // Importação local desativada para manter integridade do banco
    showNotification("Importação local desativada no modo Online.", 'warning');
    return false;
  };

  // --- UI COMPONENTS FOR NOTIFICATION ---
  const getNotificationStyles = (type: NotificationType) => {
    switch (type) {
      case 'success': return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/80 dark:text-emerald-100 dark:border-emerald-800';
      case 'error': return 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/80 dark:text-red-100 dark:border-red-800';
      case 'warning': return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-900/80 dark:text-amber-100 dark:border-amber-800';
      default: return 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/80 dark:text-blue-100 dark:border-blue-800';
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'success': return <CheckCircle size={20} className="shrink-0" />;
      case 'error': return <AlertCircle size={20} className="shrink-0" />;
      case 'warning': return <AlertTriangle size={20} className="shrink-0" />;
      default: return <Info size={20} className="shrink-0" />;
    }
  };

  return (
    <MachineContext.Provider value={{ 
      machines, workHours, history, tvConfig, isLoading,
      getMachineById, updateMachineStatus, updateAccumulatedTime, updateProductionData,
      updateCycleConfig, updateWorkHours, updateTvConfig,
      resetSystem, exportData, importData, generateMockData,
      showNotification, downloadExcelReport
    }}>
      {children}

      {/* GLOBAL NOTIFICATION TOAST */}
      {notification && (
        <div className="fixed top-6 right-6 z-[100] animate-in slide-in-from-right duration-300 fade-in">
          <div className={`flex items-start gap-3 p-4 rounded-xl border shadow-2xl backdrop-blur-md max-w-sm w-full ${getNotificationStyles(notification.type)}`}>
            {getNotificationIcon(notification.type)}
            <div className="flex-1 pt-0.5">
              <p className="font-bold text-sm leading-tight">{notification.message}</p>
            </div>
            <button 
              onClick={closeNotification}
              className="opacity-60 hover:opacity-100 transition-opacity p-0.5"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

    </MachineContext.Provider>
  );
};

export const useMachines = () => {
  const context = useContext(MachineContext);
  if (!context) throw new Error('useMachines must be used within a MachineProvider');
  return context;
};
