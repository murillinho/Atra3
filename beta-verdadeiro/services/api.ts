
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Machine, MachineHistoryLog, TvConfig, WorkHoursConfig, MachineStatus, StopReason, CycleUnit } from "../types";

// --- DADOS INICIAIS (SEED LOCAL FALLBACK) ---
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

// Helper para mapear dados do Banco (snake_case) para App (camelCase)
const mapMachineFromDb = (m: any): Machine => ({
  id: m.id,
  name: m.name,
  status: m.status as MachineStatus,
  reason: m.reason as StopReason,
  lastUpdated: m.last_updated,
  accumulatedDowntimeMs: m.accumulated_downtime_ms,
  notes: m.notes,
  lastOperator: m.last_operator,
  productionCount: m.production_count,
  scrapCount: m.scrap_count,
  cycleTimeValue: m.cycle_time_value,
  cycleTimeUnit: m.cycle_time_unit as CycleUnit
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
  // 1. Carregar Tudo
  loadFullData: async () => {
    if (!isSupabaseConfigured() || !supabase) {
      console.warn("Supabase não configurado. Usando fallback local.");
      return { 
        machines: INITIAL_MACHINES, 
        workHours: INITIAL_SETTINGS.workHours, 
        tvConfig: INITIAL_SETTINGS.tvConfig, 
        history: [] 
      };
    }

    try {
      // Fetch Machines
      const { data: machinesData, error: machinesError } = await supabase
        .from('machines')
        .select('*')
        .order('id', { ascending: true });

      if (machinesError) throw machinesError;

      // Seed inicial se o banco estiver vazio
      let machines = machinesData.map(mapMachineFromDb);
      if (machines.length === 0) {
        const { data: newMachines } = await supabase
          .from('machines')
          .insert(INITIAL_MACHINES.map(m => ({
            id: m.id,
            name: m.name,
            status: m.status,
            reason: m.reason,
            last_updated: m.lastUpdated,
            accumulated_downtime_ms: m.accumulatedDowntimeMs,
            notes: m.notes,
            last_operator: m.lastOperator,
            production_count: m.productionCount,
            scrap_count: m.scrapCount,
            cycle_time_value: m.cycleTimeValue,
            cycle_time_unit: m.cycleTimeUnit
          })))
          .select();
        
        if (newMachines) machines = newMachines.map(mapMachineFromDb);
      }

      // Fetch Settings
      const { data: settingsData } = await supabase.from('app_settings').select('*').single();
      const workHours = settingsData?.work_hours || INITIAL_SETTINGS.workHours;
      const tvConfig = settingsData?.tv_config || INITIAL_SETTINGS.tvConfig;

      // Fetch History (Last 500)
      const { data: historyData } = await supabase
        .from('history')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(500);
      
      const history = historyData ? historyData.map(mapHistoryFromDb) : [];

      return { machines, workHours, tvConfig, history };

    } catch (error) {
      console.error("Erro ao carregar do Supabase:", error);
      return { machines: [], workHours: INITIAL_SETTINGS.workHours, tvConfig: INITIAL_SETTINGS.tvConfig, history: [] };
    }
  },

  // 2. Atualizar Status
  updateStatus: async (
    id: number, 
    status: MachineStatus, 
    reason: StopReason | null, 
    notes: string, 
    operator: string,
    workHours: WorkHoursConfig,
    signature?: string
  ) => {
    if (!supabase) return;

    const now = new Date().toISOString();

    // Buscar status anterior para o log
    const { data: currentMachine } = await supabase.from('machines').select('status').eq('id', id).single();
    const previousStatus = currentMachine?.status || MachineStatus.RUNNING;

    // Atualiza Máquina
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

    // Insere Log
    const { data: newLog, error: logError } = await supabase
      .from('history')
      .insert({
        machine_id: id,
        previous_status: previousStatus,
        new_status: status,
        reason,
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

  // 3. Atualizar Tempo Acumulado
  updateAccumulatedTime: async (id: number, newTimeMs: number) => {
    if (!supabase) return;
    
    await supabase
      .from('machines')
      .update({ accumulated_downtime_ms: newTimeMs })
      .eq('id', id);
  },

  // 4. Atualizar Configurações
  updateConfig: async (workHours?: WorkHoursConfig, tvConfig?: TvConfig) => {
    if (!supabase) return;

    const updates: any = {};
    if (workHours) updates.work_hours = workHours;
    if (tvConfig) updates.tv_config = tvConfig;

    // Assume ID 1 para configurações globais
    await supabase
      .from('app_settings')
      .update(updates)
      .eq('id', 1);
  },

  // 5. Reset Diário
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
      .gt('id', 0) // Todos os IDs
      .select();
      
    if (error) throw error;
    return { machines: data.map(mapMachineFromDb) };
  }
};
