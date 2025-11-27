import React, { useEffect } from 'react';
import { X } from 'lucide-react';

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
  <div className="w-full flex flex-col items-end justify-start mb-2 animate-fade-in select-none pt-1">
    <h2 className="text-2xl font-light font-serif text-white/90 tracking-wide mb-1 text-right drop-shadow-sm">
      {title}
    </h2>
    {subtitle && (
      <div className="flex items-center gap-2 opacity-70">
        <p className="text-lucid-dim font-serif text-xs tracking-[0.2em] uppercase text-right">{subtitle}</p>
        <div className="w-6 h-[1px] bg-lucid-glow/50 rounded-full"></div>
      </div>
    )}
  </div>
);

export const TabNav: React.FC<{ 
  tabs: { id: string; label: string; icon?: React.ElementType; badge?: boolean }[]; 
  activeTab: string; 
  onTabChange: (id: any) => void; 
}> = ({ tabs, activeTab, onTabChange }) => (
  <div className="flex justify-center mb-2">
    <div className="flex items-center bg-white/[0.03] p-1.5 rounded-full border border-white/5 backdrop-blur-xl relative shadow-2xl">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            relative px-5 py-2 rounded-full text-xs font-serif tracking-widest transition-all duration-500 z-10 flex items-center gap-2 group
            ${activeTab === tab.id ? 'text-white' : 'text-lucid-dim hover:text-white'}
          `}
        >
          {activeTab === tab.id && (
             <div className="absolute inset-0 bg-white/10 rounded-full shadow-[0_0_15px_rgba(255,255,255,0.05)] border border-white/10 -z-10 animate-fade-in"></div>
          )}
          {tab.icon && <tab.icon className={`w-4 h-4 transition-colors duration-300 ${activeTab === tab.id ? 'text-lucid-glow' : 'opacity-50 group-hover:opacity-80'}`} />}
          {tab.label}
          {tab.badge && <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>}
        </button>
      ))}
    </div>
  </div>
);

export const Modal: React.FC<{ isOpen: boolean; onClose: () => void; children: React.ReactNode; title?: string }> = ({ isOpen, onClose, children, title }) => {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            ></div>
            
            {/* Content */}
            <div className="relative bg-[#1C1917] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-hidden shadow-2xl flex flex-col animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 md:p-6 border-b border-white/5 bg-white/[0.02]">
                    <h3 className="text-xl font-serif text-white tracking-wide">{title}</h3>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-lucid-dim hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                
                {/* Scrollable Body */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};

export const SimpleMarkdown: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  // Split content by newlines to handle line-by-line processing
  const lines = content.split('\n');

  const parseLine = (line: string, index: number) => {
      // 1. Headers
      if (line.match(/^###\s+(.*)/)) {
          return <h4 key={index} className="text-base font-bold text-lucid-glow mt-4 mb-2">{parseInline(line.replace(/^###\s+/, ''))}</h4>;
      }
      if (line.match(/^##\s+(.*)/)) {
          return <h3 key={index} className="text-lg font-bold text-white mt-6 mb-3 border-l-2 border-lucid-glow/50 pl-3">{parseInline(line.replace(/^##\s+/, ''))}</h3>;
      }
      if (line.match(/^#\s+(.*)/)) {
          return <h2 key={index} className="text-xl font-bold text-white mt-8 mb-4">{parseInline(line.replace(/^#\s+/, ''))}</h2>;
      }

      // 2. Lists
      if (line.match(/^[-*]\s+(.*)/)) {
          return (
            <div key={index} className="flex items-start gap-2 mb-2 ml-2">
                <span className="text-lucid-glow mt-1.5 block w-1 h-1 rounded-full bg-current flex-shrink-0"></span>
                <span className="text-stone-300 text-sm leading-relaxed">{parseInline(line.replace(/^[-*]\s+/, ''))}</span>
            </div>
          );
      }
      
      // 3. Separators
      if (line.trim() === '---') {
          return <hr key={index} className="border-white/10 my-4" />;
      }

      // 4. Empty lines
      if (line.trim() === '') {
          return <div key={index} className="h-2"></div>;
      }

      // 5. Regular Paragraphs
      return <p key={index} className="text-stone-300 text-sm leading-relaxed mb-2 font-serif">{parseInline(line)}</p>;
  };

  const parseInline = (text: string) => {
      // Handle **bold**
      const parts = text.split(/(\*\*.*?\*\*)/g);
      return parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="text-white font-medium">{part.slice(2, -2)}</strong>;
          }
          return part;
      });
  };

  return (
      <div className="markdown-content">
          {lines.map((line, i) => parseLine(line, i))}
      </div>
  );
};