import React, { useState, useEffect } from 'react';
import { AppView, Wish, IntentState, JournalEntry } from './types';
import { Feather, Wand2, Sun, Hourglass, Sparkles, Key, ArrowRight, User } from 'lucide-react';

// Components
import IntentView from './components/IntentView';
import ToolsView from './components/ToolsView';
import RitualView from './components/RitualView';
import ArchiveView from './components/ArchiveView';
import { SectionTitle, Button } from './components/Shared';

// Services
import { setDynamicApiKey, hasApiKey, setUserName } from './services/geminiService';

const App: React.FC = () => {
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState(() => 
    typeof localStorage !== 'undefined' ? localStorage.getItem('lucid_api_key') || '' : ''
  );
  const [userNameInput, setUserNameInput] = useState(() => 
    typeof localStorage !== 'undefined' ? localStorage.getItem('lucid_user_name') || '' : ''
  );

  const [currentView, setCurrentView] = useState<AppView>(AppView.INTENT);
  const [wishes, setWishes] = useState<Wish[]>([]);
  const [activeWishId, setActiveWishId] = useState<string | null>(null);
  
  // Check authorization on mount
  useEffect(() => {
    if (hasApiKey()) {
      setIsAuthorized(true);
    }
  }, []);

  const handleStartSystem = () => {
    if (apiKeyInput.trim().length > 10) {
      setDynamicApiKey(apiKeyInput.trim());
      if (userNameInput.trim()) {
        setUserName(userNameInput.trim());
      }
      setIsAuthorized(true);
    }
  };
  
  // Global Journal State for Archiving
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>(() => {
    const saved = localStorage.getItem('lucid_all_journals');
    return saved ? JSON.parse(saved) : [];
  });

  const handleAddJournalEntry = (entry: JournalEntry) => {
    const updated = [entry, ...journalEntries];
    setJournalEntries(updated);
    localStorage.setItem('lucid_all_journals', JSON.stringify(updated));
  };

  // Persistent State for Intent View
  const [intentState, setIntentState] = useState<IntentState>({
    step: 'input',
    wishInput: '',
    messages: [],
    isTyping: false,
    generatedAffirmations: [],
    generatedVoiceAudio: null,
    selectedVoice: 'Kore',
    generatedMusicAudio: null,
    selectedMusicStyle: '',
    mixingMode: 'subliminal',
    finalSubliminalAudio: null,
  });

  // Derive active wish
  const activeWish = wishes.find(w => w.id === activeWishId) || wishes[0];

  const handleWishCreated = (wish: Wish) => {
    setWishes(prev => [wish, ...prev]);
    setActiveWishId(wish.id);
    setTimeout(() => setCurrentView(AppView.TOOLS), 0);
  };

  const handleWishUpdate = (updatedWish: Wish) => {
    setWishes(prev => prev.map(w => w.id === updatedWish.id ? updatedWish : w));
  };

  const navItems = [
    { view: AppView.INTENT, icon: Feather, label: '愿望' },
    { view: AppView.TOOLS, icon: Wand2, label: '工具' },
    { view: AppView.RITUAL, icon: Sun, label: '仪式' },
    { view: AppView.ARCHIVE, icon: Hourglass, label: '时空' },
  ];

  // --- API KEY GATEKEEPER VIEW ---
  if (!isAuthorized) {
    return (
      <div className="min-h-screen text-lucid-text font-serif bg-lucid-bg flex flex-col items-center justify-center p-6 relative overflow-hidden">
         {/* Background Effects */}
         <div className="absolute inset-0 pointer-events-none">
             <div className="absolute top-[-20%] left-[-20%] w-[80%] h-[80%] bg-[#3F2E26] rounded-full blur-[150px] opacity-30 animate-pulse-slow"></div>
             <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] bg-[#4C3A35] rounded-full blur-[120px] opacity-20"></div>
         </div>

         <div className="z-10 w-full max-w-md space-y-8 text-center animate-fade-in">
             <div className="flex flex-col items-center gap-4">
                 <div className="w-16 h-16 rounded-full bg-lucid-glow/10 flex items-center justify-center shadow-[0_0_30px_rgba(253,186,116,0.15)] border border-lucid-glow/20">
                    <Sparkles className="w-8 h-8 text-lucid-glow" />
                 </div>
                 <h1 className="text-3xl font-serif text-white tracking-widest">LUCID · 澄</h1>
                 <p className="text-lucid-dim font-sans text-sm tracking-widest uppercase">潜意识操作系统</p>
             </div>

             <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-[2rem] p-8 shadow-2xl space-y-6 text-left">
                 
                 <div className="space-y-2">
                     <label className="text-xs text-lucid-glow uppercase tracking-wider font-bold flex items-center gap-2">
                         <User className="w-3 h-3" /> Your Name
                     </label>
                     <p className="text-xs text-lucid-dim">LUCID 将如何称呼您？</p>
                     <input 
                        type="text"
                        value={userNameInput}
                        onChange={(e) => setUserNameInput(e.target.value)}
                        placeholder="请输入您的名字或昵称"
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lucid-glow/50 transition-all font-sans text-sm tracking-wide"
                     />
                 </div>

                 <div className="space-y-2">
                     <label className="text-xs text-lucid-glow uppercase tracking-wider font-bold flex items-center gap-2">
                         <Key className="w-3 h-3" /> API Access Key
                     </label>
                     <p className="text-xs text-lucid-dim">请输入您的 Google Gemini API Key 以激活能量场。</p>
                     <input 
                        type="password"
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-lucid-glow/50 transition-all font-sans text-sm tracking-wide"
                     />
                 </div>
                 
                 <Button 
                    onClick={handleStartSystem} 
                    disabled={apiKeyInput.length < 10}
                    variant="primary" 
                    className="w-full rounded-xl py-4 text-sm tracking-widest shadow-lg shadow-lucid-glow/20"
                 >
                    启动系统 <ArrowRight className="w-4 h-4 ml-2" />
                 </Button>

                 <p className="text-[10px] text-stone-600 font-sans text-center">
                     Key 仅存储于您的本地浏览器，我们无法访问。
                 </p>
             </div>
         </div>
      </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="min-h-screen text-lucid-text font-serif selection:bg-lucid-glow/30 selection:text-white overflow-hidden relative bg-lucid-bg">
      
      {/* Healing Ethereal Background - Warm Tones */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
         <div className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-[#3F2E26] rounded-full blur-[120px] opacity-40 animate-pulse-slow"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-[#4C3A35] rounded-full blur-[100px] opacity-30 animate-float" style={{ animationDuration: '25s' }}></div>
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40%] h-[40%] bg-lucid-glow/5 rounded-full blur-[150px]"></div>
      </div>

      <main className="relative z-10 h-screen flex flex-col md:flex-row">
        
        {/* Navigation Sidebar */}
        <nav className="order-2 md:order-1 w-full md:w-28 flex md:flex-col items-center md:items-center justify-between md:justify-start py-4 md:py-8 z-50 transition-all duration-300 md:border-r border-white/5 bg-white/[0.01] backdrop-blur-md flex-shrink-0">
           
           {/* Logo - Clickable to reset Auth */}
           <div 
             className="hidden md:flex flex-col items-center mb-10 opacity-90 hover:opacity-100 transition-opacity cursor-pointer"
             onClick={() => setIsAuthorized(false)}
             title="点击修改 API Key 和 昵称"
           >
             <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-lucid-glow/20 to-transparent flex items-center justify-center mb-3">
                 <Sparkles className="w-5 h-5 text-lucid-glow" />
             </div>
             <span className="text-xs font-serif tracking-[0.3em] font-light text-white">LUCID</span>
           </div>
           
           {/* Mobile Logo - Clickable */}
           <div 
             className="md:hidden flex items-center gap-2 ml-6 cursor-pointer"
             onClick={() => setIsAuthorized(false)}
             title="点击修改 API Key 和 昵称"
           >
             <Sparkles className="w-5 h-5 text-lucid-glow" />
             <span className="text-sm font-serif tracking-[0.2em] text-white">LUCID</span>
           </div>

           {/* Mobile Nav Items: Compact and Right-aligned */}
           <div className="flex md:flex-col gap-3 md:gap-3 mr-9 md:mr-0 md:mt-16">
             {navItems.map((item) => (
               <button
                 key={item.view}
                 onClick={() => setCurrentView(item.view)}
                 className={`group flex flex-col items-center gap-1.5 relative transition-all duration-500 outline-none p-1 md:p-2 rounded-xl ${
                   currentView === item.view ? 'opacity-100' : 'opacity-40 hover:opacity-70'
                 }`}
               >
                 <div className={`p-3 md:p-3.5 rounded-2xl transition-all duration-500 ease-out ${currentView === item.view ? 'bg-lucid-glow text-lucid-bg scale-100 shadow-[0_0_20px_rgba(253,186,116,0.3)]' : 'bg-white/5 text-white scale-90'}`}>
                   <item.icon className={`w-5 h-5 stroke-[1.5px]`} />
                 </div>
                 <span className="text-sm tracking-[0.1em] font-sans hidden md:block">{item.label}</span>
               </button>
             ))}
           </div>
        </nav>

        {/* Main Content Area */}
        <div className="order-1 md:order-2 flex-1 relative overflow-hidden flex flex-col">
           <div className="flex-1 w-full h-full p-2 md:p-6 max-w-6xl mx-auto flex flex-col">
              {currentView === AppView.INTENT && (
                <IntentView state={intentState} setState={setIntentState} onComplete={handleWishCreated} />
              )}
              
              {currentView === AppView.TOOLS && (
                activeWish ? (
                  <ToolsView wish={activeWish} wishes={wishes} onUpdateWish={handleWishUpdate} />
                ) : (
                  <div className="w-full h-full flex flex-col">
                    <SectionTitle title="显化工具" subtitle="TOOLS · 能量素材库" />
                    <div className="flex-1 flex flex-col items-center justify-center text-lucid-dim space-y-8 animate-fade-in">
                      <div className="relative group cursor-pointer" onClick={() => setCurrentView(AppView.INTENT)}>
                        <div className="absolute inset-0 bg-lucid-glow blur-[60px] rounded-full opacity-10 group-hover:opacity-20 transition-opacity"></div>
                        <Wand2 className="w-20 h-20 text-white/10 group-hover:text-white/30 transition-colors relative z-10" />
                      </div>
                      <div className="text-center space-y-3">
                        <p className="text-2xl font-serif text-white/80">能量场静默</p>
                        <p className="text-sm font-sans tracking-widest opacity-60">所有的显化都始于一个清晰的意图</p>
                      </div>
                      <button onClick={() => setCurrentView(AppView.INTENT)} className="px-10 py-3 rounded-full border border-white/10 hover:bg-white/5 transition-colors font-sans text-xs tracking-widest text-lucid-glow hover:text-white">
                        前往创建愿望
                      </button>
                    </div>
                  </div>
                )
              )}

              {currentView === AppView.RITUAL && <RitualView wishes={wishes} onAddJournalEntry={handleAddJournalEntry} />}
              
              {currentView === AppView.ARCHIVE && <ArchiveView wishes={wishes} journalEntries={journalEntries} onUpdateWish={handleWishUpdate} />}
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;