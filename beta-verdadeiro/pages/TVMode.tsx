
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMachines } from '../context/MachineContext';
import { MachineStatus } from '../types';
import { calculateActiveDowntime } from '../utils/timeCalculations';
import AtrasorbLogo from '../components/AtrasorbLogo';
import { 
  AlertTriangle, Clock, Loader2, WifiOff, X, Maximize, Minimize, 
  Activity, ArrowRight, Factory, Timer
} from 'lucide-react';

const TVMode: React.FC = () => {
  const { tvConfig, machines, workHours, isLoading } = useMachines();
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [isVisible, setIsVisible] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const navigate = useNavigate();

  // --- CONTROLS VISIBILITY ON MOUSE MOVE ---
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleMouseMove = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 4000);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  // --- KEYBOARD CONTROLS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleExit();
      if (e.key === 'ArrowRight') manualNext();
      if (e.key === 'ArrowLeft') manualPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [machines]);

  // --- CLOCK TICK ---
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // --- ROTATION LOGIC ---
  useEffect(() => {
    if (!machines || machines.length === 0) return;

    // Se a máquina atual sumiu (ex: filtro), reseta index
    if (currentIndex >= machines.length) {
      setCurrentIndex(0);
    }

    const rotationTimeMs = (tvConfig?.intervalSeconds || 15) * 1000;
    const transitionDurationMs = 600;

    const cycle = setInterval(() => {
      setIsVisible(false);
      setTimeout(() => {
        // Usa callback para garantir estado atualizado
        setCurrentIndex((prev) => {
           const next = (prev + 1) % machines.length;
           return next;
        });
        setIsVisible(true);
      }, transitionDurationMs);
    }, rotationTimeMs);

    return () => clearInterval(cycle);
  }, [machines, tvConfig?.intervalSeconds]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((e) => console.log(e));
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const handleExit = () => {
    if (document.fullscreenElement) {
       document.exitFullscreen().catch(() => {});
    }
    navigate('/');
  };

  const manualNext = () => {
    setIsVisible(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % machines.length);
      setIsVisible(true);
    }, 300);
  };

  const manualPrev = () => {
    setIsVisible(false);
    setTimeout(() => {
      setCurrentIndex((prev) => (prev - 1 + machines.length) % machines.length);
      setIsVisible(true);
    }, 300);
  };

  const formatDuration = (ms: number) => {
    if (typeof ms !== 'number' || isNaN(ms) || ms < 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    // Formato HH:MM:SS com fonte mono
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')}`;
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-center text-white">
        <Loader2 className="w-16 h-16 animate-spin text-blue-500 mb-4" />
        <h2 className="text-2xl font-bold tracking-widest uppercase animate-pulse">Carregando Sistema...</h2>
      </div>
    );
  }

  if (!machines || machines.length === 0) {
    return (
      <div className="fixed inset-0 z-[200] bg-slate-900 flex flex-col items-center justify-center text-white p-10 text-center">
        <WifiOff className="w-24 h-24 text-slate-700 mb-6" />
        <h1 className="text-4xl font-bold mb-4">Aguardando Dados</h1>
        <p className="text-slate-400 max-w-md mx-auto text-lg">Nenhuma máquina conectada. Verifique o cadastro.</p>
        <button onClick={handleExit} className="mt-10 px-8 py-4 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold border border-slate-700 transition-colors">Voltar ao Menu</button>
      </div>
    );
  }

  // Ensure robust machine selection
  const safeIndex = currentIndex % machines.length;
  const machine = machines[safeIndex];
  const nextIndex = (currentIndex + 1) % machines.length;
  const nextMachine = machines[nextIndex];

  if (!machine) return null; // Should not happen given checks above

  const isRunning = machine.status === MachineStatus.RUNNING;
  const activeDowntime = !isRunning ? calculateActiveDowntime(machine.lastUpdated, workHours, currentTime) : 0;
  const bgColor = isRunning ? 'bg-slate-950' : 'bg-red-950';

  return (
    <div className={`fixed inset-0 z-[150] ${bgColor} text-white flex flex-col overflow-hidden font-sans select-none transition-colors duration-1000`}>
      
      {/* --- HEADER --- */}
      <header className="h-[10vh] px-6 md:px-10 flex justify-between items-center z-20 border-b border-white/10 bg-black/20 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-6">
           <div className="bg-white p-2 rounded-xl h-14 w-32 flex items-center justify-center shadow-lg">
              <AtrasorbLogo className="h-full w-auto object-contain" forceLight />
           </div>
           <div className="hidden lg:block h-10 w-px bg-white/10"></div>
           <div className="hidden lg:block">
             <h1 className="text-sm text-slate-400 font-bold uppercase tracking-[0.2em] mb-1">Painel de Produção</h1>
             <div className="flex items-center gap-2 text-white/80 text-sm">
                <Factory size={16} />
                <span className="font-medium">Unidade Principal • Turno A</span>
             </div>
           </div>
        </div>
        
        <div className="text-right">
           <span className="block text-4xl lg:text-5xl font-mono font-bold leading-none tabular-nums text-white drop-shadow-lg">
             {new Date(currentTime).toLocaleTimeString('pt-BR')}
           </span>
           <span className="text-xs font-bold text-blue-400 uppercase tracking-widest mt-1 block">
             Horário de Brasília
           </span>
        </div>
      </header>

      {/* --- FLOATING CONTROLS --- */}
      <div className={`fixed top-8 right-8 z-50 flex gap-3 transition-all duration-500 ${showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
        <button onClick={toggleFullscreen} className="p-3 bg-slate-800/90 hover:bg-slate-700 text-white rounded-full border border-slate-600 backdrop-blur" title="Tela Cheia">
          {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
        </button>
        <button onClick={handleExit} className="p-3 bg-red-600/90 hover:bg-red-500 text-white rounded-full shadow-lg backdrop-blur" title="Sair">
          <X size={20} />
        </button>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-1 flex items-center justify-center relative w-full h-[75vh] p-4">
        
        {/* Animated Wrapper */}
        <div 
          className={`
            w-full max-w-[90vw] flex flex-col items-center justify-center transition-all duration-500 ease-out transform
            ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-8'}
          `}
        >
            {/* Machine Name & Badge */}
            <div className="flex flex-col items-center mb-8 w-full text-center">
              <div className={`
                 px-6 py-2 rounded-full border-2 text-base font-bold uppercase tracking-[0.3em] mb-6 shadow-lg
                 ${isRunning ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-300' : 'bg-red-500/10 border-red-500/50 text-red-300 animate-pulse'}
              `}>
                {isRunning ? 'LINHA OPERACIONAL' : 'INTERRUPÇÃO CRÍTICA'}
              </div>
              <h2 className="text-[10vmin] leading-none font-black text-white tracking-tight uppercase drop-shadow-2xl">
                {machine.name}
              </h2>
            </div>

            {/* STATUS DISPLAY */}
            {isRunning ? (
              // === RUNNING LAYOUT ===
              <div className="flex flex-col items-center justify-center flex-1 animate-in fade-in duration-1000">
                 <div className="relative mb-8">
                    <div className="absolute inset-0 bg-emerald-500 blur-[100px] opacity-20 animate-pulse"></div>
                    <div className="relative w-[35vmin] h-[35vmin] rounded-full border-[10px] border-emerald-500/30 bg-emerald-950/50 flex items-center justify-center shadow-[0_0_80px_rgba(16,185,129,0.2)]">
                       
                       {/* Rotating Rings */}
                       <div className="absolute inset-0 rounded-full border-t-4 border-emerald-400 animate-[spin_3s_linear_infinite]"></div>
                       <div className="absolute inset-4 rounded-full border-b-4 border-emerald-600 animate-[spin_5s_linear_infinite_reverse]"></div>

                       <div className="flex flex-col items-center">
                         <Activity className="w-24 h-24 text-emerald-400 mb-2 drop-shadow-[0_0_15px_rgba(52,211,153,0.8)]" />
                         <span className="text-3xl font-bold text-emerald-100 uppercase tracking-widest">Ativa</span>
                       </div>
                    </div>
                 </div>
                 <div className="bg-emerald-900/30 border border-emerald-500/30 px-12 py-4 rounded-2xl backdrop-blur-sm">
                    <p className="text-emerald-300 text-xl font-medium tracking-wide">Produção Normalizada</p>
                 </div>
              </div>
            ) : (
              // === STOPPED LAYOUT ===
              <div className="flex flex-col items-center justify-center w-full max-w-6xl relative z-10">
                 
                 {/* Giant Timer Box */}
                 <div className="w-full bg-gradient-to-br from-red-600 to-red-800 rounded-[3rem] p-1.5 shadow-[0_30px_80px_rgba(220,38,38,0.3)] transform hover:scale-[1.02] transition-transform duration-500">
                    <div className="bg-red-700/50 rounded-[2.8rem] border-[4px] border-white/10 px-10 py-12 flex flex-col items-center relative overflow-hidden backdrop-blur-xl">
                       
                       {/* Background Pattern */}
                       <div className="absolute inset-0 opacity-20 pointer-events-none" 
                            style={{ backgroundImage: 'repeating-linear-gradient(45deg, #000 0, #000 20px, transparent 20px, transparent 40px)' }}>
                       </div>

                       <div className="relative z-10 flex items-center gap-3 text-red-100 uppercase tracking-[0.3em] font-bold text-xl mb-4 animate-pulse">
                          <Timer className="w-8 h-8" /> Tempo Parado
                       </div>

                       <div className="relative z-10 text-[18vmin] leading-[0.85] font-black font-mono text-white tabular-nums tracking-tighter drop-shadow-lg">
                          {formatDuration(activeDowntime)}
                       </div>
                    </div>
                 </div>

                 {/* Reason Badge */}
                 <div className="mt-8 flex items-center gap-6 bg-black/40 backdrop-blur-2xl border border-white/20 px-12 py-6 rounded-3xl animate-in slide-in-from-bottom-10 fade-in duration-700 delay-100 shadow-2xl">
                    <div className="bg-white text-red-600 w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg shrink-0">
                       <AlertTriangle size={48} />
                    </div>
                    <div className="text-left">
                       <p className="text-red-300 text-sm font-bold uppercase tracking-[0.2em] mb-1">Motivo da Parada</p>
                       <p className="text-5xl font-black text-white uppercase tracking-tight leading-none">{machine.reason}</p>
                    </div>
                 </div>
              </div>
            )}
        </div>
      </main>

      {/* --- FOOTER (Progress & Next) --- */}
      <footer className="h-[15vh] bg-slate-900 border-t border-white/10 flex items-center justify-between px-6 md:px-10 z-20 relative">
         
         {/* Next Machine Preview */}
         <div className="flex items-center gap-6">
            <span className="text-sm font-bold uppercase tracking-widest text-slate-500">
              A Seguir:
            </span>
            <div className="flex items-center gap-4 bg-slate-800/80 px-6 py-4 rounded-2xl border border-white/5 shadow-lg">
               <div className={`w-3 h-3 rounded-full ${nextMachine?.status === MachineStatus.RUNNING ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-red-500 shadow-[0_0_10px_#ef4444] animate-pulse'}`}></div>
               <span className="text-2xl font-bold text-white max-w-[250px] truncate">{nextMachine?.name}</span>
               {nextMachine?.status === MachineStatus.STOPPED && (
                 <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded font-bold uppercase border border-red-500/30">Parada</span>
               )}
            </div>
         </div>

         {/* Pagination Indicators */}
         <div className="flex items-center gap-3">
            {machines.map((_, idx) => (
              <div 
                key={idx} 
                className={`
                  h-2 rounded-full transition-all duration-500 
                  ${idx === safeIndex ? 'w-16 bg-white shadow-[0_0_15px_white]' : 'w-2 bg-slate-700 opacity-40'}
                `}
              />
            ))}
         </div>

         {/* Animated Progress Line at absolute bottom */}
         <div className="absolute bottom-0 left-0 w-full h-2 bg-slate-800">
            <div 
              key={currentIndex} // Key change forces re-render of animation
              className={`h-full ${isRunning ? 'bg-emerald-500' : 'bg-red-500'} origin-left shadow-[0_0_20px_currentColor]`}
              style={{
                width: '100%',
                animation: `tvProgress ${tvConfig?.intervalSeconds || 15}s linear forwards`
              }}
            />
         </div>
      </footer>

      <style>{`
        @keyframes tvProgress {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
};

export default TVMode;
