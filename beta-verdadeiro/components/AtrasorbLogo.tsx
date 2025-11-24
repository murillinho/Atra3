import React from 'react';

interface LogoProps {
  className?: string;
  forceLight?: boolean;
}

export const AtrasorbLogo: React.FC<LogoProps> = ({ className, forceLight }) => {
  // Brand Blue: #0033a0
  const brandClass = forceLight 
    ? "fill-[#0033a0]" 
    : "fill-[#0033a0] dark:fill-blue-400 transition-colors duration-300";
    
  const subClass = forceLight 
    ? "fill-slate-600" 
    : "fill-slate-600 dark:fill-slate-400 transition-colors duration-300";

  return (
    <svg 
      viewBox="0 0 240 70" 
      xmlns="http://www.w3.org/2000/svg" 
      className={className}
      aria-labelledby="atrasorbTitle"
    >
      <title id="atrasorbTitle">Atrasorb</title>
      <text 
        x="50%" 
        y="42" 
        textAnchor="middle" 
        fontFamily="Arial, Helvetica, sans-serif" 
        fontWeight="900" 
        fontSize="48" 
        className={brandClass}
        letterSpacing="-2.5"
      >
        atrasorb
      </text>
      <text 
        x="50%" 
        y="62" 
        textAnchor="middle" 
        fontFamily="Arial, Helvetica, sans-serif" 
        fontWeight="500" 
        fontSize="10.5" 
        className={subClass}
        letterSpacing="2"
      >
        Absorvedores de CO<tspan dy="3" fontSize="8" fontWeight="bold">2</tspan>
      </text>
    </svg>
  );
};

export default AtrasorbLogo;
