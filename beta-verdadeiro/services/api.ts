
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Machine, MachineHistoryLog, TvConfig, WorkHoursConfig, MachineStatus, StopReason, CycleUnit } from "../types";

// --- FALLBACK DATA (Caso Supabase não esteja conectado) ---
const INITIAL_MACHINES: Machine[] = Array.from({ length: 8 }, (_, i) => ({
  id: i + 1,
  name: `Modeladora ${i + 1}`,
  status: MachineStatus.RUNNING,
  reason: null,
  lastUpdated: new Date().toISOString(),
  accumulatedDowntimeMs: 0,
  notes: '',
  lastOperator: 'Sistema',
  productionCount: 0,
  scrapCount: 0,
  cycleTimeValue: 30,
  cycleTimeUnit: CycleUnit.SECONDS
}));

const INITIAL_SETTINGS = {
  workHours: { enabled: true, start: "08:00", end: "18:49" },
  tvConfig: { intervalSeconds: 15 }
};

// --- MAPPERS (Snake Case DB -> Camel Case App) ---
const mapMachineFromDb = (m: any): Machine => ({
  id: m.id,
  name: m.name,
  status: m.status as MachineStatus,
  reason: m.reason as StopReason,
  lastUpdated: m.last_updated,
  accumulatedDowntimeMs: m.accumulated_downtime_ms || 0,
  notes: m.notes || '',
  lastOperator: m.last_operator || 'Sistema',
  productionCount: m.production_count || 0,
  scrapCount: m.scrap_count || 0,
  cycleTimeValue: m.cycle_time_value || 30,
  cycleTimeUnit: (m.cycle_time_unit as CycleUnit) || CycleUnit.SECONDS
});

const mapHistoryFromDb = (h: any): MachineHistoryLog => ({
  id: h.id,
  machineId: h.machine_id,
  previousStatus: h.previous_status as MachineStatus,
  newStatus: h.new_status as MachineStatus,
  reason: h.reason as StopReason,
  timestamp: h.timestamp,
  signature: h.signature
});

export const api = {
  // 1. Carregar Tudo (Machines + Settings + History)
  loadFullData: async () => {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn("Supabase não configurado/detectado. Usando modo offline/mock.");
      return { 
        machines: INITIAL_MACHINES, 
        workHours: INITIAL_SETTINGS.workHours, 
        tvConfig: INITIAL_SETTINGS.tvConfig, 
        history: [] 
      };
    }

    try {
      // 1. Buscar Machines
      const { data: machinesData, error: machinesError } = await supabase
        .from('machines')
        .select('*')
        .order('id', { ascending: true });

      if (machinesError) throw machinesError;

      let machines = machinesData.map(mapMachineFromDb);

      // 2. Buscar Configurações
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('*')
        .single();

      const workHours = settingsData?.work_hours || INITIAL_SETTINGS.workHours;
      const tvConfig = settingsData?.tv_config || INITIAL_SETTINGS.tvConfig;

      // 3. Buscar Histórico (Últimos 500 registros para performance)
      const { data: historyData } = await supabase
        .from('history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);
      
      const history = historyData ? historyData.map(mapHistoryFromDb) : [];

      return { machines, workHours, tvConfig, history };

    } catch (error) {
      console.error("Erro ao carregar dados do Supabase:", error);
      // Retorna vazio/padrão para não quebrar a UI em caso de erro de conexão
      return { machines: [], workHours: INITIAL_SETTINGS.workHours, tvConfig: INITIAL_SETTINGS.tvConfig, history: [] };
    }
  },

  // 2. Atualizar Status da Máquina
  updateStatus: async (
    id: number, 
    status: MachineStatus, 
    reason: StopReason | null, 
    notes: string, 
    operator: string,
    workHours: WorkHoursConfig, // Mantido para compatibilidade de assinatura, mas não usado no DB direto
    signature?: string
  ) => {
    if (!supabase) return;

    const now = new Date().toISOString();

    // Busca status anterior para garantir consistência no log
    const { data: currentMachine } = await supabase
      .from('machines')
      .select('status')
      .eq('id', id)
      .single();
      
    const previousStatus = currentMachine?.status || MachineStatus.RUNNING;

    // Atualiza tabela machines
    const { data: updatedMachine, error: machineError } = await supabase
      .from('machines')
      .update({
        status,
        reason: status === MachineStatus.RUNNING ? null : reason,
        notes: status === MachineStatus.RUNNING ? '' : notes,
        last_updated: now,
        last_operator: operator
      })
      .eq('id', id)
      .select()
      .single();

    if (machineError) throw machineError;

    // Insere no histórico
    const { data: newLog, error: logError } = await supabase
      .from('history')
      .insert({
        machine_id: id,
        previous_status: previousStatus,
        new_status: status,
        reason: reason,
        timestamp: now,
        signature
      })
      .select()
      .single();

    if (logError) throw logError;

    return {
      machine: mapMachineFromDb(updatedMachine),
      log: mapHistoryFromDb(newLog)
    };
  },

  // 3. Atualizar Tempo Acumulado (Ajuste manual do supervisor ou timer)
  updateAccumulatedTime: async (id: number, newTimeMs: number) => {
    if (!supabase) return;
    
    const { error } = await supabase
      .from('machines')
      .update({ accumulated_downtime_ms: newTimeMs })
      .eq('id', id);
      
    if (error) console.error("Erro ao atualizar tempo:", error);
  },

  // 4. Atualizar Configurações
  updateConfig: async (workHours?: WorkHoursConfig, tvConfig?: TvConfig) => {
    if (!supabase) return;

    const updates: any = {};
    if (workHours) updates.work_hours = workHours;
    if (tvConfig) updates.tv_config = tvConfig;

    // Assume ID 1 como configuração padrão global
    const { error } = await supabase
      .from('app_settings')
      .update(updates)
      .eq('id', 1);

    if (error) console.error("Erro ao salvar configurações:", error);
  },

  // 5. Reset Diário (Zera contadores)
  resetDaily: async () => {
    if (!supabase) return { machines: [] };

    const { data, error } = await supabase
      .from('machines')
      .update({
        accumulated_downtime_ms: 0,
        production_count: 0,
        scrap_count: 0,
        last_updated: new Date().toISOString()
      })
      .gt('id', 0) // Update all
      .select();
      
    if (error) throw error;
    return { machines: data.map(mapMachineFromDb) };
  }
};
