import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'glass' | 'outline' }> = ({ className = '', variant = 'primary', ...props }) => {
  const baseStyles = "px-6 py-2.5 rounded-2xl font-serif text-sm tracking-wider transition-all duration-500 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center relative overflow-hidden";
  
  const variants = {
    // Warm gradient: Orange to Rose
    primary: "bg-gradient-to-r from-orange-500/80 to-rose-400/80 text-white shadow-lg shadow-orange-500/20 hover:shadow-orange-500/30 hover:brightness-105",
    // Minimalist text
    ghost: "bg-transparent text-lucid-dim hover:text-white hover:bg-white/5",
    // Clean glass
    glass: "bg-white/5 backdrop-blur-md border border-white/10 text-white hover:bg-white/10 hover:border-white/20",
    // Thin outline
    outline: "border border-white/10 text-lucid-glow hover:bg-white/5"
  };

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props} />
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <div onClick={onClick} className={`bg-white/[0.02] backdrop-blur-2xl border border-white/[0.05] rounded-3xl p-6 transition-all duration-700 hover:bg-white/[0.04] ${className}`}>
    {children}
  </div>
);

export const LoadingSpinner = () => (
  <div className="flex items-center justify-center space-x-2">
    <div className="w-1.5 h-1.5 bg-lucid-glow/50 rounded-full animate-pulse" style={{ animationDelay: '0s' }}></div>
    <div className="w-1.5 h-1.5 bg-lucid-glow/50 rounded-full animate-pulse" style={{ animationDelay: '0.3s' }}></div>
    <div className="w-1.5 h-1.5 bg-lucid-glow/50 rounded-full animate-pulse" style={{ animationDelay: '0.6s' }}></div>
  </div>
);

export const SectionTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => (
  <div className="mb-6 text-center animate-fade-in select-none pt-2">
    <h2 className="text-2xl md:text-3xl font-light font-serif text-white/90 tracking-wide mb-1">
      {title}
    </h2>
    {subtitle && (
      <p className="text-lucid-dim font-serif text-[10px] tracking-[0.3em] uppercase opacity-60">{subtitle}</p>
    )}
  </div>
);

export const TabNav: React.FC<{ 
  tabs: { id: string; label: string; icon?: React.ElementType }[]; 
  activeTab: string; 
  onTabChange: (id: any) => void; 
}> = ({ tabs, activeTab, onTabChange }) => (
  <div className="flex justify-center mb-6">
    <div className="flex items-center bg-white/[0.03] p-1 rounded-full border border-white/5 backdrop-blur-xl relative shadow-2xl">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            relative px-4 py-1.5 rounded-full text-xs font-serif tracking-widest transition-all duration-500 z-10 flex items-center gap-2 group
            ${activeTab === tab.id ? 'text-white' : 'text-lucid-dim hover:text-white'}
          `}
        >
          {activeTab === tab.id && (
             <div className="absolute inset-0 bg-white/10 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/10 -z-10 animate-fade-in"></div>
          )}
          {tab.icon && <tab.icon className={`w-3.5 h-3.5 transition-colors duration-300 ${activeTab === tab.id ? 'text-lucid-glow' : 'opacity-50 group-hover:opacity-80'}`} />}
          {tab.label}
        </button>
      ))}
    </div>
  </div>
);