
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { MachineProvider } from './context/MachineContext';
import { ThemeProvider } from './context/ThemeContext';
import Header from './components/Header';
import Overview from './pages/Overview';
import Machines from './pages/Machines';
import ControlPanel from './pages/ControlPanel';
import Dashboard from './pages/Dashboard';
import Settings from './pages/Settings';
import Supervisor from './pages/Supervisor';
import TVMode from './pages/TVMode';
import SoundAlert from './components/SoundAlert';
import AtrasorbLogo from './components/AtrasorbLogo';
import { WifiOff, Wifi, Loader2 } from 'lucide-react';

const SplashScreen: React.FC<{ onFinish: () => void }> = ({ onFinish }) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onFinish, 800); // Espera a animação de saída terminar
    }, 2500);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 dark:from-slate-950 dark:to-slate-900 transition-opacity duration-1000 ease-out ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
      <div className="flex flex-col items-center animate-in zoom-in-95 fade-in duration-1000 px-4">
        
        {/* Logo Container with Glow */}
        <div className="relative mb-10 p-8 rounded-3xl bg-white/50 dark:bg-white/5 backdrop-blur-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/10 flex items-center justify-center">
           <AtrasorbLogo className="w-64 md:w-80 h-auto drop-shadow-lg" />
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-4xl md:text-5xl font-black text-slate-800 dark:text-white tracking-tight drop-shadow-sm">
            Bem-vindo
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-lg font-medium tracking-wide uppercase opacity-80">
            Sistema de Gestão Industrial
          </p>
        </div>

        {/* Loading Indicator */}
        <div className="mt-12 flex flex-col items-center gap-3">
           <div className="flex gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-600 animate-[bounce_1s_infinite_-0.3s]"></span>
              <span className="w-3 h-3 rounded-full bg-blue-600 animate-[bounce_1s_infinite_-0.15s]"></span>
              <span className="w-3 h-3 rounded-full bg-blue-600 animate-[bounce_1s_infinite]"></span>
           </div>
           <span className="text-xs font-mono text-slate-400 mt-2 uppercase tracking-widest">Iniciando...</span>
        </div>

      </div>
      
      {/* Footer Branding */}
      <div className="absolute bottom-8 text-slate-400 text-xs font-medium">
         © {new Date().getFullYear()} Atrasorb Indústria
      </div>
    </div>
  );
};

const OfflineBanner: React.FC = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="bg-amber-500 text-slate-900 px-4 py-2 text-center text-sm font-bold flex items-center justify-center gap-2 animate-in slide-in-from-top fixed top-0 w-full z-[200] shadow-md">
      <WifiOff size={18} />
      <span>Modo Offline Ativo. As alterações serão sincronizadas quando a conexão retornar.</span>
    </div>
  );
};

const AppContent: React.FC = () => {
  const location = useLocation();
  const isTvMode = location.pathname === '/tv';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${isTvMode ? 'bg-slate-950 overflow-hidden' : 'bg-slate-50 dark:bg-slate-950'}`}>
      <OfflineBanner />
      {!isTvMode && <Header />}
      
      <main className={`flex-1 w-full ${isTvMode ? 'h-screen' : 'max-w-7xl mx-auto'}`}>
        <div 
          key={location.pathname} 
          className={isTvMode ? 'w-full h-full' : 'animate-page-enter w-full h-full'}
          style={isTvMode ? { transform: 'none' } : undefined}
        >
          <Routes>
            <Route path="/" element={<Machines />} />
            <Route path="/overview" element={<Overview />} />
            <Route path="/control/:id" element={<ControlPanel />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/supervisor" element={<Supervisor />} />
            <Route path="/tv" element={<TVMode />} />
          </Routes>
        </div>
      </main>
      
      {!isTvMode && <SoundAlert />}
    </div>
  );
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);

  return (
    <ThemeProvider>
      <MachineProvider>
        {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
        <Router>
          <AppContent />
        </Router>
      </MachineProvider>
    </ThemeProvider>
  );
};

export default App;
