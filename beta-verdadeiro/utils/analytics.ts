
import { Machine, MachineHistoryLog, MachineStatus, StopReason, WorkHoursConfig, CycleUnit } from "../types";
import { calculateActiveDowntime, getElapsedShiftTimeTodayMs } from "./timeCalculations";

// Tipos auxiliares simplificados (Sem OEE)
export interface MachineMetrics {
  machineId: number;
  machineName: string;
  totalDowntimeMs: number;
  failureCount: number;
  lastReason?: string | null;
  status: MachineStatus;
}

export interface ParetoItem {
  reason: string;
  count: number;
  durationMs: number;
  accumulatedPercent?: number;
}

/**
 * Processa o histórico de logs para calcular intervalos de parada.
 */
const getDowntimeIntervals = (
  history: MachineHistoryLog[], 
  machines: Machine[],
  workHours: WorkHoursConfig,
  filterStart?: Date
) => {
  const sortedLogs = [...history].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const intervals: { machineId: number; reason: string; start: number; end: number; duration: number }[] = [];
  const activeStops: Record<number, { start: number; reason: string }> = {};

  sortedLogs.forEach(log => {
    const ts = new Date(log.timestamp).getTime();
    if (filterStart && ts < filterStart.getTime()) return;

    if (log.newStatus === MachineStatus.STOPPED) {
      activeStops[log.machineId] = { 
        start: ts, 
        reason: log.reason || 'Desconhecido' 
      };
    } else if (log.newStatus === MachineStatus.RUNNING && activeStops[log.machineId]) {
      const start = activeStops[log.machineId].start;
      const duration = ts - start; 
      intervals.push({
        machineId: log.machineId,
        reason: activeStops[log.machineId].reason,
        start,
        end: ts,
        duration
      });
      delete activeStops[log.machineId];
    }
  });

  const now = Date.now();
  machines.forEach(m => {
    if (m.status === MachineStatus.STOPPED && activeStops[m.id]) {
       const start = activeStops[m.id].start;
       const duration = calculateActiveDowntime(new Date(start).toISOString(), workHours, now);
       intervals.push({
         machineId: m.id,
         reason: activeStops[m.id].reason,
         start,
         end: now,
         duration
       });
    }
  });

  return intervals;
};

/**
 * Calcula métricas focadas em TEMPO PARADO (Sem OEE)
 */
export const calculateFleetMetrics = (
  machines: Machine[],
  history: MachineHistoryLog[],
  workHours: WorkHoursConfig
): MachineMetrics[] => {
  const intervals = getDowntimeIntervals(history, machines, workHours);
  
  return machines.map(machine => {
    const machineIntervalsAll = intervals.filter(i => i.machineId === machine.id);
    const failureCount = machineIntervalsAll.length;
    
    // Usamos o 'accumulatedDowntimeMs' da máquina que já é resetado diariamente e soma paradas ativas
    const currentStopDuration = machine.status === MachineStatus.STOPPED
        ? calculateActiveDowntime(machine.lastUpdated, workHours)
        : 0;
    
    const downtimeTodayMs = machine.accumulatedDowntimeMs + currentStopDuration;
    
    return {
      machineId: machine.id,
      machineName: machine.name,
      totalDowntimeMs: downtimeTodayMs, // Exibe o tempo parado de HOJE nas tabelas
      failureCount,
      status: machine.status,
      lastReason: machine.reason
    };
  });
};

export const calculatePareto = (
  machines: Machine[], 
  history: MachineHistoryLog[],
  workHours: WorkHoursConfig
): ParetoItem[] => {
  const intervals = getDowntimeIntervals(history, machines, workHours);
  
  const grouped: Record<string, { count: number; duration: number }> = {};

  intervals.forEach(i => {
    if (!grouped[i.reason]) grouped[i.reason] = { count: 0, duration: 0 };
    grouped[i.reason].count += 1;
    grouped[i.reason].duration += i.duration;
  });

  const totalDuration = Object.values(grouped).reduce((acc, curr) => acc + curr.duration, 0);

  let sorted = Object.keys(grouped)
    .map(reason => ({
      reason,
      count: grouped[reason].count,
      durationMs: grouped[reason].duration,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);

  let accumulated = 0;
  return sorted.map(item => {
    const percent = totalDuration > 0 ? (item.durationMs / totalDuration) * 100 : 0;
    accumulated += percent;
    return { ...item, accumulatedPercent: Math.round(accumulated) };
  });
};

export const calculateTimeTotals = (
  machines: Machine[], 
  history: MachineHistoryLog[],
  workHours: WorkHoursConfig
) => {
  const intervals = getDowntimeIntervals(history, machines, workHours);
  const now = new Date();
  
  const startOfDay = new Date(now.setHours(0,0,0,0)).getTime();
  const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay())).getTime(); 
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const sumDuration = (filterTime: number) => 
    intervals
      .filter(i => i.end >= filterTime)
      .reduce((acc, curr) => acc + curr.duration, 0);

  return {
    dailyMs: sumDuration(startOfDay),
    weeklyMs: sumDuration(startOfWeek),
    monthlyMs: sumDuration(startOfMonth)
  };
};

export const generateAIInsights = (
  metrics: MachineMetrics[], 
  pareto: ParetoItem[]
): string[] => {
  const insights: string[] = [];
  
  const stoppedMachines = metrics.filter(m => m.status === MachineStatus.STOPPED);
  if (stoppedMachines.length > 0) {
    insights.push(`Atenção: ${stoppedMachines.length} máquina(s) parada(s) neste momento.`);
  }

  const mostDowntime = [...metrics].sort((a,b) => b.totalDowntimeMs - a.totalDowntimeMs)[0];
  if (mostDowntime && mostDowntime.totalDowntimeMs > 0) {
    const hours = (mostDowntime.totalDowntimeMs / 3600000).toFixed(1);
    insights.push(`Gargalo: ${mostDowntime.machineName} acumula o maior tempo parado hoje (${hours}h).`);
  }

  if (pareto.length > 0) {
    const topReason = pareto[0];
    insights.push(`Principal Ofensor: "${topReason.reason}" é responsável pela maior parte do tempo perdido.`);
  }

  return insights;
};
