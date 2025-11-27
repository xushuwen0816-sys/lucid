import React, { useState, useMemo, useEffect } from 'react';
import { Wish, FutureLetter, JournalEntry } from '../types';
import { SectionTitle, Card, Button, LoadingSpinner, TabNav, Modal, SimpleMarkdown } from './Shared';
import { Archive, Mail, Clock, Send, Star, Lock, Unlock, BarChart, Trophy, Zap, ArrowRight, Play, Eye, Sparkles, RefreshCw, Calendar as CalendarIcon, ChevronRight, ChevronLeft } from 'lucide-react';
import { generateFutureLetterReply, generateWeeklyReport } from '../services/geminiService';

interface ArchiveViewProps {
  wishes: Wish[];
  journalEntries: JournalEntry[];
  onUpdateWish: (wish: Wish) => void;
}

type DetailsType = 'wishes' | 'journals' | 'blocks' | 'traits' | 'emotions' | null;

// Helper: Get emotional score (valence)
const getSentimentScore = (emotion: string): number => {
    const map: Record<string, number> = {
        'joy': 9, 'happy': 8, 'excited': 8, 'grateful': 9, 'peaceful': 7, 'calm': 7, 'hopeful': 8, 'confident': 9,
        'inspired': 9, 'love': 10, 'content': 7, 'proud': 8, 'relieved': 7,
        'neutral': 5, 'okay': 5,
        'tired': 4, 'bored': 4, 'confused': 4, 'anxious': 3, 'sad': 3, 'angry': 2, 'frustrated': 3, 'overwhelmed': 2,
        'lonely': 2, 'guilty': 2, 'ashamed': 1, 'hopeless': 1, 'fear': 2,
        // Chinese translations
        '喜悦': 9, '快乐': 8, '兴奋': 8, '感恩': 9, '平静': 7, '安宁': 7, '希望': 8, '自信': 9,
        '灵感': 9, '爱': 10, '满足': 7, '自豪': 8, '释然': 7,
        '平淡': 5, '还好': 5,
        '疲惫': 4, '无聊': 4, '困惑': 4, '焦虑': 3, '悲伤': 3, '愤怒': 2, '挫败': 3, '压力': 2,
        '孤独': 2, '内疚': 2, '羞愧': 1, '绝望': 1, '恐惧': 2, '烦躁': 3, '自我批评': 2
    };
    
    // Fuzzy matching for partial keys
    const lower = emotion.toLowerCase();
    if (map[lower]) return map[lower];
    
    for (const key in map) {
        if (lower.includes(key)) return map[key];
    }
    
    return 5; // Default neutral
};

const ArchiveView: React.FC<ArchiveViewProps> = ({ wishes, journalEntries, onUpdateWish }) => {
  const [tab, setTab] = useState<'wishes' | 'milestones' | 'letters'>('wishes');
  
  // --- Wish State ---
  const [selectedWish, setSelectedWish] = useState<Wish | null>(null);

  // --- Milestones State ---
  const [reportLoading, setReportLoading] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(() => {
      return localStorage.getItem('lucid_weekly_report_content');
  });
  const [detailsModal, setDetailsModal] = useState<DetailsType>(null);
  
  // --- Letters State ---
  const [letters, setLetters] = useState<FutureLetter[]>(() => {
     try {
       return JSON.parse(localStorage.getItem('lucid_future_letters') || '[]');
     } catch { return []; }
  });
  const [letterInput, setLetterInput] = useState('');
  const [letterDelay, setLetterDelay] = useState<number>(30); // days
  const [isSending, setIsSending] = useState(false);
  const [showLetterInput, setShowLetterInput] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<FutureLetter | null>(null);

  // --- Derived Stats for Milestones ---
  const stats = useMemo(() => {
     const totalEntries = journalEntries.length;
     const emotionCounts: Record<string, number> = {};
     const allBlocks: { text: string, date: number }[] = [];
     const allTraits: { text: string, date: number }[] = [];
     const sentimentData: { date: number, score: number, emotions: string[] }[] = [];

     // Sort entries by date ascending for chart
     const sortedEntries = [...journalEntries].sort((a, b) => a.date - b.date);
     
     sortedEntries.forEach(entry => {
         if(entry.aiAnalysis) {
             const emotions = Array.isArray(entry.aiAnalysis.emotionalState) 
                ? entry.aiAnalysis.emotionalState 
                : (typeof entry.aiAnalysis.emotionalState === 'string' ? [entry.aiAnalysis.emotionalState] : []);

             let entryScoreSum = 0;
             emotions.forEach(em => {
                 if (em) {
                    emotionCounts[em] = (emotionCounts[em] || 0) + 1;
                    entryScoreSum += getSentimentScore(em);
                 }
             });
             
             // Calculate average sentiment for this entry
             if (emotions.length > 0) {
                 sentimentData.push({
                     date: entry.date,
                     score: entryScoreSum / emotions.length,
                     emotions: emotions
                 });
             }
             
             if (entry.aiAnalysis.blocksIdentified) {
                 entry.aiAnalysis.blocksIdentified.forEach(b => allBlocks.push({ text: b, date: entry.date }));
             }
             if (entry.aiAnalysis.highSelfTraits) {
                 entry.aiAnalysis.highSelfTraits.forEach(t => allTraits.push({ text: t, date: entry.date }));
             }
         }
     });

     const uniqueBlocks = Array.from(new Set(allBlocks.map(b => b.text)));
     const uniqueTraits = Array.from(new Set(allTraits.map(t => t.text)));
     
     const topEmotions = Object.entries(emotionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

     return { totalEntries, allBlocks, uniqueBlocks, allTraits, uniqueTraits, topEmotions, sentimentData };
  }, [journalEntries]);

  // Check for unlocked letters
  const hasUnlockedLetters = useMemo(() => {
      return letters.some(l => !l.isLocked && Date.now() >= l.sendDate && (l as any).read !== true); // 'read' property simulated
  }, [letters]);

  // --- Auto Generate Report Logic ---
  useEffect(() => {
    if (tab === 'milestones') {
        const checkAndGenerateReport = async () => {
            const now = new Date();
            const day = now.getDay(); // 0 is Sunday
            const hour = now.getHours();
            
            const lastGenTimestamp = localStorage.getItem('lucid_weekly_report_date');
            let shouldGenerate = false;

            if (!lastGenTimestamp) {
                if (journalEntries.length > 0) shouldGenerate = true;
            } else {
                const lastGen = new Date(parseInt(lastGenTimestamp));
                const oneWeek = 7 * 24 * 60 * 60 * 1000;
                
                if (now.getTime() - lastGen.getTime() > oneWeek && journalEntries.length > 0) {
                     shouldGenerate = true;
                } else if (day === 0 && hour >= 20 && now.toDateString() !== lastGen.toDateString() && journalEntries.length > 0) {
                     shouldGenerate = true;
                }
            }

            if (shouldGenerate && !reportLoading) {
                setReportLoading(true);
                const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                const recentEntries = journalEntries.filter(e => e.date > oneWeekAgo);
                
                const report = await generateWeeklyReport(recentEntries.length > 0 ? recentEntries : journalEntries.slice(0,5));
                
                setAiReport(report);
                localStorage.setItem('lucid_weekly_report_content', report);
                localStorage.setItem('lucid_weekly_report_date', Date.now().toString());
                setReportLoading(false);
            }
        };
        
        checkAndGenerateReport();
    }
  }, [tab, journalEntries, reportLoading]);

  // --- Handlers ---
  
  const handleGenerateReport = async () => {
      setReportLoading(true);
      const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentEntries = journalEntries.filter(e => e.date > oneWeekAgo);
      const entriesToUse = recentEntries.length > 0 ? recentEntries : journalEntries.slice(0, 10);

      const report = await generateWeeklyReport(entriesToUse);
      setAiReport(report);
      localStorage.setItem('lucid_weekly_report_content', report);
      localStorage.setItem('lucid_weekly_report_date', Date.now().toString());
      setReportLoading(false);
  };

  const handleSendLetter = async () => {
    if(!letterInput.trim()) return;
    setIsSending(true);
    
    // Calculate unlock time
    const unlockTime = Date.now() + (letterDelay * 24 * 60 * 60 * 1000); 
    const actualUnlockTime = letterDelay === 0 ? Date.now() + 10000 : unlockTime;

    const reply = await generateFutureLetterReply(letterInput);
    
    const newLetter: FutureLetter = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      content: letterInput,
      sendDate: actualUnlockTime,
      aiReply: reply,
      isLocked: true 
    };

    const updated = [newLetter, ...letters];
    setLetters(updated);
    localStorage.setItem('lucid_future_letters', JSON.stringify(updated));
    
    setLetterInput('');
    setIsSending(false);
    setShowLetterInput(false);
  };

  const toggleWishStatus = () => {
      if (!selectedWish) return;
      const newStatus = selectedWish.status === 'active' ? 'manifested' : 'active';
      const updatedWish = { ...selectedWish, status: newStatus as any };
      onUpdateWish(updatedWish);
      setSelectedWish(updatedWish); 
  };

  const getWishPhase = (wish: Wish) => {
      if (wish.status === 'manifested') return { name: '已显化', color: 'text-emerald-400', border: 'border-emerald-500/30' };
      if (wish.visionImage) return { name: '视觉化 · Vision', color: 'text-purple-400', border: 'border-purple-500/30' };
      if (wish.subliminalAudioBlob) return { name: '植入 · Imprint', color: 'text-orange-400', border: 'border-orange-500/30' };
      if (Object.keys(wish.beliefs || {}).length > 0) return { name: '校准 · Align', color: 'text-blue-400', border: 'border-blue-500/30' };
      return { name: '意图 · Intent', color: 'text-stone-400', border: 'border-stone-500/30' };
  };

  // --- Sub-components ---
  
  const JournalCalendar = () => {
      const [currentDate, setCurrentDate] = useState(new Date());
      const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

      const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
      const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

      const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
      const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

      // Map entries to days
      const entriesByDay = useMemo(() => {
          const map: Record<number, JournalEntry> = {};
          journalEntries.forEach(e => {
              const d = new Date(e.date);
              if (d.getMonth() === currentDate.getMonth() && d.getFullYear() === currentDate.getFullYear()) {
                  map[d.getDate()] = e;
              }
          });
          return map;
      }, [currentDate, journalEntries]);

      return (
          <div className="flex flex-col h-full">
              {selectedEntry ? (
                  <div className="animate-fade-in">
                      <button onClick={() => setSelectedEntry(null)} className="flex items-center text-xs text-lucid-dim hover:text-white mb-4">
                          <ChevronLeft className="w-4 h-4 mr-1"/> Back to Calendar
                      </button>
                      <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                          <div className="flex justify-between items-center">
                              <span className="text-sm text-lucid-glow font-serif">{new Date(selectedEntry.date).toLocaleDateString()}</span>
                              <div className="flex gap-2">
                                  {Array.isArray(selectedEntry.aiAnalysis?.emotionalState) && selectedEntry.aiAnalysis?.emotionalState.map((e, i) => (
                                      <span key={i} className="text-[10px] bg-white/10 px-2 py-0.5 rounded text-stone-300">{e}</span>
                                  ))}
                              </div>
                          </div>
                          <p className="text-stone-200 font-serif leading-relaxed text-sm">{selectedEntry.content}</p>
                          {selectedEntry.aiAnalysis && (
                              <div className="pt-4 border-t border-white/5">
                                  <h4 className="text-xs text-lucid-dim uppercase mb-2">AI Insight</h4>
                                  <p className="text-xs text-stone-400 leading-relaxed">{selectedEntry.aiAnalysis.summary}</p>
                              </div>
                          )}
                      </div>
                  </div>
              ) : (
                  <>
                    <div className="flex justify-between items-center mb-6 px-2">
                        <button onClick={prevMonth} className="p-1 hover:bg-white/10 rounded-full"><ChevronLeft className="w-5 h-5 text-lucid-dim"/></button>
                        <span className="text-lg font-serif text-white">{currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
                        <button onClick={nextMonth} className="p-1 hover:bg-white/10 rounded-full"><ChevronRight className="w-5 h-5 text-lucid-dim"/></button>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center mb-2">
                        {['S','M','T','W','T','F','S'].map(d => <span key={d} className="text-[10px] text-lucid-dim font-sans">{d}</span>)}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`}></div>)}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const entry = entriesByDay[day];
                            return (
                                <button
                                    key={day}
                                    onClick={() => entry && setSelectedEntry(entry)}
                                    disabled={!entry}
                                    className={`
                                        aspect-square rounded-xl flex items-center justify-center text-xs font-serif transition-all relative
                                        ${entry 
                                            ? 'bg-lucid-glow/10 text-white hover:bg-lucid-glow/20 border border-lucid-glow/20 shadow-sm cursor-pointer' 
                                            : 'bg-white/[0.02] text-stone-600 cursor-default'}
                                    `}
                                >
                                    {day}
                                    {entry && <div className="absolute bottom-1.5 w-1 h-1 bg-lucid-glow rounded-full"></div>}
                                </button>
                            );
                        })}
                    </div>
                  </>
              )}
          </div>
      );
  };

  const SentimentChart = () => {
      const data = stats.sentimentData;
      if (data.length < 2) return <p className="text-xs text-stone-500 italic text-center py-4">需要更多日记数据来生成曲线</p>;

      const height = 100;
      const width = 300; // viewBox width
      const maxScore = 10;
      const minScore = 1;
      
      // Calculate points
      const points = data.map((d, i) => {
          const x = (i / (data.length - 1)) * width;
          const y = height - ((d.score - minScore) / (maxScore - minScore)) * height;
          return `${x},${y}`;
      }).join(' ');

      return (
          <div className="w-full h-32 relative group">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                  {/* Grid Lines */}
                  <line x1="0" y1="0" x2={width} y2="0" stroke="white" strokeOpacity="0.05" strokeDasharray="4 4" />
                  <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="white" strokeOpacity="0.05" strokeDasharray="4 4" />
                  <line x1="0" y1={height} x2={width} y2={height} stroke="white" strokeOpacity="0.05" strokeDasharray="4 4" />
                  
                  {/* Path */}
                  <polyline
                      fill="none"
                      stroke="#FDBA74"
                      strokeWidth="2"
                      points={points}
                      vectorEffect="non-scaling-stroke"
                      className="drop-shadow-[0_0_10px_rgba(253,186,116,0.3)]"
                  />
                  
                  {/* Dots */}
                  {data.map((d, i) => {
                       const x = (i / (data.length - 1)) * width;
                       const y = height - ((d.score - minScore) / (maxScore - minScore)) * height;
                       return (
                           <circle 
                            key={i} 
                            cx={x} 
                            cy={y} 
                            r="3" 
                            fill="#1C1917" 
                            stroke="#FDBA74" 
                            strokeWidth="2"
                            className="hover:scale-150 transition-transform cursor-pointer"
                           >
                               <title>{new Date(d.date).toLocaleDateString()}: {d.emotions.join(', ')}</title>
                           </circle>
                       )
                  })}
              </svg>
              <div className="absolute top-0 right-0 text-[10px] text-lucid-dim opacity-0 group-hover:opacity-100 transition-opacity">
                  High Valence
              </div>
              <div className="absolute bottom-0 right-0 text-[10px] text-lucid-dim opacity-0 group-hover:opacity-100 transition-opacity">
                  Low Valence
              </div>
          </div>
      );
  };

  return (
    <div className="w-full h-full flex flex-col">
      <SectionTitle title="我的时空" subtitle="ARCHIVE · 成就与未来" />

      <TabNav 
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
            { id: 'wishes', icon: Star, label: '显化列表' },
            { id: 'milestones', icon: Trophy, label: '里程碑' },
            { id: 'letters', icon: Clock, label: '时间胶囊', badge: hasUnlockedLetters }
        ]}
      />

      <div className="flex-1 overflow-y-auto px-4 custom-scrollbar animate-fade-in pb-20">
        <div className="max-w-5xl mx-auto w-full">
            
            {/* 1. WISHES LIST */}
            {tab === 'wishes' && (
                <div className="space-y-6">
                    {wishes.length === 0 ? (
                         <div className="flex flex-col items-center justify-center text-stone-500 py-32 space-y-4">
                            <div className="p-6 bg-white/5 rounded-full">
                                <Archive className="w-8 h-8 opacity-50" />
                            </div>
                            <p className="font-serif text-base">暂无显化记录</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-5">
                            {wishes.map(wish => {
                                const phase = getWishPhase(wish);
                                const days = Math.floor((Date.now() - wish.createdAt) / (1000 * 60 * 60 * 24));
                                return (
                                    <div 
                                        key={wish.id}
                                        onClick={() => setSelectedWish(wish)}
                                        className={`group relative bg-white/[0.02] hover:bg-white/[0.05] border ${phase.border} rounded-3xl p-6 transition-all duration-300 cursor-pointer hover:shadow-lg hover:shadow-lucid-glow/5`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <span className={`text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-black/20 ${phase.color}`}>
                                                {phase.name}
                                            </span>
                                            <span className="text-xs text-lucid-dim font-serif">Started {days}d ago</span>
                                        </div>
                                        
                                        <h3 className="text-lg font-serif text-white mb-2 line-clamp-2 leading-relaxed group-hover:text-lucid-glow transition-colors">
                                            {wish.content}
                                        </h3>
                                        
                                        <div className="flex flex-wrap gap-2 mt-4">
                                            {wish.tags?.emotional?.slice(0, 3).map((tag, i) => (
                                                <span key={i} className="text-xs text-stone-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">#{tag}</span>
                                            ))}
                                        </div>

                                        <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <ArrowRight className="w-5 h-5 text-lucid-glow" />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* 2. MILESTONES DASHBOARD */}
            {tab === 'milestones' && (
                <div className="space-y-8 animate-fade-in">
                    {/* Stats Cards - Clickable */}
                    <div className="grid grid-cols-3 gap-4">
                        <Card onClick={() => setDetailsModal('wishes')} className="flex flex-col items-center justify-center py-8 bg-gradient-to-br from-purple-900/10 to-transparent cursor-pointer hover:bg-white/5 group">
                            <span className="text-3xl font-serif text-white mb-1 group-hover:scale-110 transition-transform">{wishes.length}</span>
                            <span className="text-xs text-lucid-dim uppercase tracking-widest flex items-center gap-1">Wishes <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"/></span>
                        </Card>
                        <Card onClick={() => setDetailsModal('journals')} className="flex flex-col items-center justify-center py-8 bg-gradient-to-br from-orange-900/10 to-transparent cursor-pointer hover:bg-white/5 group">
                            <span className="text-3xl font-serif text-white mb-1 group-hover:scale-110 transition-transform">{stats.totalEntries}</span>
                            <span className="text-xs text-lucid-dim uppercase tracking-widest flex items-center gap-1">Journals <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"/></span>
                        </Card>
                        <Card onClick={() => setDetailsModal('blocks')} className="flex flex-col items-center justify-center py-8 bg-gradient-to-br from-emerald-900/10 to-transparent cursor-pointer hover:bg-white/5 group">
                            <span className="text-3xl font-serif text-white mb-1 group-hover:scale-110 transition-transform">{stats.uniqueBlocks.length}</span>
                            <span className="text-xs text-lucid-dim uppercase tracking-widest flex items-center gap-1">Blocks Cleared <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"/></span>
                        </Card>
                    </div>

                    {/* AI Weekly Report */}
                    <Card className="relative overflow-hidden border-lucid-glow/20">
                         <div className="flex justify-between items-center mb-6">
                             <div className="flex items-center gap-2">
                                 <Zap className="w-5 h-5 text-lucid-glow" />
                                 <h3 className="text-lg font-serif text-white">LUCID 能量报告</h3>
                             </div>
                             {aiReport && (
                                 <span className="text-[10px] text-stone-500 uppercase tracking-widest border border-stone-800 px-2 py-1 rounded bg-black/20">
                                     Every Sunday 20:00
                                 </span>
                             )}
                         </div>
                         
                         {!aiReport ? (
                             <div className="flex flex-col items-center justify-center py-10 space-y-4">
                                 <p className="text-stone-400 text-sm">基于你的觉察日记，生成本周的能量分析。</p>
                                 <Button onClick={handleGenerateReport} disabled={reportLoading} variant="glass" className="rounded-full px-8 text-sm">
                                    {reportLoading ? <LoadingSpinner/> : '生成周度报告'}
                                 </Button>
                             </div>
                         ) : (
                             <div className="space-y-6">
                                {/* Markdown Renderer */}
                                <SimpleMarkdown content={aiReport} />
                                
                                <div className="flex justify-center pt-4 border-t border-white/5 mt-4">
                                    <Button onClick={handleGenerateReport} disabled={reportLoading} variant="ghost" className="text-xs text-lucid-dim hover:text-white">
                                        <RefreshCw className={`w-3 h-3 mr-2 ${reportLoading ? 'animate-spin' : ''}`} /> 重新生成报告
                                    </Button>
                                </div>
                             </div>
                         )}
                    </Card>

                    {/* High Self Traits & Emotional Curve */}
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* High Self Traits */}
                        <Card onClick={() => setDetailsModal('traits')} className="flex flex-col cursor-pointer hover:bg-white/5 transition-colors group">
                             <div className="flex items-center justify-between mb-4">
                                 <h4 className="text-sm font-serif text-lucid-dim uppercase tracking-widest flex items-center gap-2">
                                     <Star className="w-3 h-3 text-lucid-glow" /> 收获特质
                                 </h4>
                                 <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white/80 transition-colors" />
                             </div>
                             <div className="flex flex-wrap gap-2 flex-1 content-start">
                                 {stats.uniqueTraits.length > 0 ? (
                                     stats.uniqueTraits.map((trait, i) => (
                                         <span key={i} className="px-3 py-1 bg-emerald-500/10 text-emerald-300 text-xs rounded-full border border-emerald-500/20">
                                             {trait}
                                         </span>
                                     ))
                                 ) : (
                                     <p className="text-stone-500 text-xs italic">持续记录日记以发现你的高我特质...</p>
                                 )}
                             </div>
                        </Card>

                        {/* Emotional Curve (Replaces Bar Chart) */}
                        <Card className="flex flex-col group">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-serif text-lucid-dim uppercase tracking-widest flex items-center gap-2">
                                    <BarChart className="w-3 h-3 text-lucid-glow" /> 情绪曲线 (Sentiment)
                                </h4>
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <SentimentChart />
                            </div>
                        </Card>
                    </div>
                </div>
            )}

            {/* 3. TIME CAPSULE (LETTERS) */}
            {tab === 'letters' && (
                <div className="space-y-8 pb-10">
                    
                    {/* Header Action (Centered if Empty) */}
                    {!showLetterInput && (
                        <div className={`flex justify-center py-8 ${letters.length === 0 ? 'min-h-[50vh] flex-col items-center justify-center space-y-4' : ''}`}>
                            {letters.length === 0 && (
                                <div className="p-6 bg-white/5 rounded-full mb-4">
                                    <Clock className="w-10 h-10 opacity-50 text-lucid-glow" />
                                </div>
                            )}
                            <Button onClick={() => setShowLetterInput(true)} variant="primary" className="rounded-full px-12 py-4 shadow-xl shadow-lucid-glow/10 text-base tracking-wide">
                                <Mail className="w-5 h-5 mr-2" /> 写给未来的自己
                            </Button>
                            {letters.length === 0 && (
                                <p className="text-stone-500 font-serif text-sm">暂无信件，开启第一封时空通信</p>
                            )}
                        </div>
                    )}

                    {/* Write Mode */}
                    {showLetterInput && (
                        <div className="max-w-2xl mx-auto">
                            <Card className="border-lucid-glow/20 bg-gradient-to-br from-stone-800/50 to-transparent p-5 md:p-8 animate-fade-in relative">
                                <button onClick={() => setShowLetterInput(false)} className="absolute top-4 right-4 text-lucid-dim hover:text-white"><Unlock className="w-4 h-4"/></button>
                                <h3 className="font-serif text-lg mb-6 text-white text-center">寄往未来</h3>
                                
                                <textarea 
                                    className="w-full bg-black/20 rounded-xl p-4 md:p-5 text-base font-serif focus:outline-none mb-6 min-h-[180px] text-stone-200 placeholder-stone-600 resize-none border border-white/5 focus:border-lucid-glow/30 transition-colors leading-relaxed"
                                    placeholder="亲爱的未来自己，希望此刻的你..."
                                    value={letterInput}
                                    onChange={(e) => setLetterInput(e.target.value)}
                                />
                                
                                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/5 pt-6">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-4 h-4 text-lucid-dim" />
                                        <span className="text-sm text-stone-400 font-serif mr-2">送达时间:</span>
                                        <select 
                                            value={letterDelay} 
                                            onChange={(e) => setLetterDelay(Number(e.target.value))}
                                            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-sm text-white focus:outline-none"
                                        >
                                            <option value={0}>10秒后 (测试)</option>
                                            <option value={7}>1周后</option>
                                            <option value={30}>1个月后</option>
                                            <option value={180}>6个月后</option>
                                            <option value={365}>1年后</option>
                                        </select>
                                    </div>
                                    <Button onClick={handleSendLetter} disabled={isSending || !letterInput} className="text-sm px-8 rounded-full">
                                        {isSending ? <LoadingSpinner /> : <span className="flex items-center gap-2">封存信件 <Send className="w-4 h-4" /></span>}
                                    </Button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* Letters Grid */}
                    {letters.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {letters.map((letter) => {
                                const isLocked = Date.now() < letter.sendDate;
                                const isNew = !isLocked && !(letter as any).read; // Simulate read state if we had it persistent

                                return (
                                    <div 
                                        key={letter.id} 
                                        onClick={() => setSelectedLetter(letter)}
                                        className={`relative group rounded-3xl p-6 border transition-all duration-300 cursor-pointer overflow-hidden ${
                                            !isLocked 
                                            ? 'bg-white/[0.04] border-white/10 hover:border-lucid-glow/30 hover:shadow-lg hover:shadow-lucid-glow/5' 
                                            : 'bg-white/[0.02] border-white/5 opacity-80'
                                        }`}
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="flex items-center gap-2">
                                                {!isLocked ? (
                                                    <div className="bg-lucid-glow/10 text-lucid-glow px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <Unlock className="w-3 h-3" />
                                                        <span className="text-[10px] uppercase tracking-wider font-bold">Unlocked</span>
                                                    </div>
                                                ) : (
                                                    <div className="bg-stone-800 text-stone-500 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <Lock className="w-3 h-3" />
                                                        <span className="text-[10px] uppercase tracking-wider font-bold">Locked</span>
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-[10px] text-stone-600 font-serif">{new Date(letter.createdAt).toLocaleDateString()}</span>
                                        </div>

                                        <h4 className="text-white font-serif text-lg mb-2 truncate">To Future Self</h4>
                                        
                                        {/* Preview logic */}
                                        <div className="text-sm text-stone-400 font-serif line-clamp-3 leading-relaxed">
                                            {letter.aiReply ? (
                                                <span className="text-lucid-glow italic">" {letter.aiReply} "</span>
                                            ) : (
                                                "Waiting for future resonance..."
                                            )}
                                        </div>

                                        {!isLocked && (
                                            <div className="absolute top-3 right-3 w-2 h-2 bg-lucid-glow rounded-full animate-pulse"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
      </div>

      {/* MODALS */}
      
      {/* 1. Details Modal (Milestones) */}
      <Modal isOpen={!!detailsModal} onClose={() => setDetailsModal(null)} title={
          detailsModal === 'wishes' ? '所有愿望 All Wishes' :
          detailsModal === 'journals' ? '觉察记录 Calendar' :
          detailsModal === 'blocks' ? '清理信念 Cleared Blocks' :
          detailsModal === 'traits' ? '高我特质 High Self Traits' : ''
      }>
          <div className="space-y-4">
              {detailsModal === 'wishes' && wishes.map(w => (
                  <div key={w.id} className="p-4 bg-white/5 rounded-xl border border-white/5">
                      <p className="text-white font-serif">{w.content}</p>
                      <div className="flex justify-between mt-2">
                        <span className="text-xs text-stone-500">{new Date(w.createdAt).toLocaleDateString()}</span>
                        <span className="text-xs text-lucid-glow">{w.status}</span>
                      </div>
                  </div>
              ))}
              
              {detailsModal === 'journals' && (
                  <JournalCalendar />
              )}

              {detailsModal === 'blocks' && (
                  stats.allBlocks.length > 0 ? stats.allBlocks.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-rose-500/5 rounded-lg border border-rose-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div>
                        <div className="flex-1">
                            <span className="text-stone-200 font-serif text-sm">{b.text}</span>
                            <span className="text-[10px] text-stone-500 block">{new Date(b.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                  )) : <p className="text-stone-500 text-center py-4">暂无数据</p>
              )}

              {detailsModal === 'traits' && (
                  stats.allTraits.length > 0 ? stats.allTraits.map((t, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                        <div className="flex-1">
                            <span className="text-stone-200 font-serif text-sm">{t.text}</span>
                            <span className="text-[10px] text-stone-500 block">{new Date(t.date).toLocaleDateString()}</span>
                        </div>
                    </div>
                  )) : <p className="text-stone-500 text-center py-4">暂无数据</p>
              )}
          </div>
      </Modal>

      {/* 2. Wish Detail Modal */}
      <Modal 
         isOpen={!!selectedWish} 
         onClose={() => setSelectedWish(null)}
         title="显化蓝图 · Blueprint"
      >
          {selectedWish && (
              <div className="space-y-8 pb-10">
                  {/* Status Bar & Action */}
                  <div className="flex justify-between items-center border-b border-white/10 pb-4">
                      <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 rounded-full text-xs font-sans tracking-wider border ${selectedWish.status === 'active' ? 'bg-lucid-glow/10 text-lucid-glow border-lucid-glow/20' : 'bg-green-500/10 text-green-400 border-green-500/20'}`}>
                              {selectedWish.status === 'active' ? '● 进行中 In Progress' : '★ 已显化 Manifested'}
                          </span>
                      </div>
                      <div className="flex items-center gap-3">
                          <span className="text-xs text-stone-500 font-serif mr-2">{new Date(selectedWish.createdAt).toLocaleString()}</span>
                          <button 
                              onClick={toggleWishStatus}
                              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${selectedWish.status === 'active' ? 'border-green-500/30 text-green-400 hover:bg-green-500/10' : 'border-stone-500/30 text-stone-400 hover:bg-white/5'}`}
                          >
                             {selectedWish.status === 'active' ? '标记为已实现' : '标记为进行中'}
                          </button>
                      </div>
                  </div>

                  {/* Core Content */}
                  <div>
                      <h3 className="text-2xl font-serif text-white leading-relaxed mb-2">{selectedWish.content}</h3>
                      <p className="text-lucid-dim font-serif italic">新身份: {selectedWish.beliefs.newIdentity}</p>
                  </div>

                  {/* Belief Map */}
                  <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                      <h4 className="text-sm text-stone-400 uppercase tracking-widest mb-4">Core Shifts</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                              <span className="text-xs text-rose-300 block mb-2">已释放阻碍</span>
                              <ul className="list-disc list-inside text-stone-400 text-sm space-y-1">
                                  {selectedWish.beliefs.emotionalBlocks.map((b,i) => <li key={i}>{b}</li>)}
                              </ul>
                          </div>
                          <div>
                              <span className="text-xs text-emerald-300 block mb-2">重塑信念</span>
                              <ul className="list-disc list-inside text-stone-400 text-sm space-y-1">
                                  {selectedWish.beliefs.limitingBeliefs.map((b,i) => <li key={i}>{b}</li>)}
                              </ul>
                          </div>
                      </div>
                  </div>

                  {/* Assets Layout - Adaptive */}
                  <div className={`grid grid-cols-1 ${selectedWish.visionImage ? 'md:grid-cols-2' : ''} gap-4`}>
                       {selectedWish.visionImage && (
                           <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 group h-full">
                               <img src={selectedWish.visionImage} alt="Vision" className="object-cover w-full h-full" />
                               <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                   <span className="text-white text-xs tracking-widest uppercase">Vision Board</span>
                               </div>
                           </div>
                       )}
                       
                       <div className="flex flex-col gap-3">
                           {selectedWish.subliminalAudioBlob && (
                               <div className="flex-1 bg-white/5 rounded-xl border border-white/5 flex items-center justify-between p-4 min-h-[80px]">
                                   <div className="flex items-center gap-3">
                                       <div className="w-10 h-10 rounded-full bg-lucid-glow/20 flex items-center justify-center">
                                           <Play className="w-4 h-4 text-lucid-glow" />
                                       </div>
                                       <div>
                                           <span className="block text-sm text-white font-serif">潜意识音频</span>
                                           <span className="block text-[10px] text-stone-500">Subliminal Loop</span>
                                       </div>
                                   </div>
                                   <a href={URL.createObjectURL(selectedWish.subliminalAudioBlob)} download="Subliminal.wav">
                                       <Button variant="ghost" className="!p-2"><Eye className="w-4 h-4"/></Button>
                                   </a>
                               </div>
                           )}
                           
                           <div className="flex-1 bg-white/5 rounded-xl border border-white/5 p-4 overflow-y-auto max-h-[200px] custom-scrollbar">
                               <span className="text-[10px] text-stone-500 uppercase block mb-3">Affirmations</span>
                               <div className="space-y-3">
                                   {selectedWish.affirmations.map((a,i) => (
                                       <div key={i} className="pl-3 border-l-2 border-white/10">
                                            <p className="text-sm text-stone-200 font-serif">{a.text}</p>
                                       </div>
                                   ))}
                               </div>
                           </div>
                       </div>
                  </div>
              </div>
          )}
      </Modal>

      {/* 3. Time Capsule Detail Modal */}
      <Modal
        isOpen={!!selectedLetter}
        onClose={() => setSelectedLetter(null)}
        title="时间信箱 · Time Capsule"
      >
          {selectedLetter && (
              <div className="space-y-8 pb-4">
                  {/* Top: Future Self Reply (Always Visible) */}
                  <div className="bg-gradient-to-br from-lucid-glow/10 to-transparent p-6 rounded-2xl border border-lucid-glow/20 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10">
                          <Sparkles className="w-24 h-24" />
                      </div>
                      <div className="flex items-center gap-2 mb-4">
                          <div className="w-8 h-8 rounded-full bg-lucid-glow text-lucid-bg flex items-center justify-center">
                              <Sparkles className="w-4 h-4" />
                          </div>
                          <div>
                              <span className="text-xs uppercase text-lucid-glow tracking-widest block font-bold">Future Self</span>
                              <span className="text-[10px] text-lucid-dim">Immediate Resonance</span>
                          </div>
                      </div>
                      <p className="text-white/90 font-serif leading-loose text-base relative z-10 italic">
                          "{selectedLetter.aiReply}"
                      </p>
                  </div>

                  {/* Bottom: Past Self Letter (Locked/Unlocked) */}
                  <div className="relative">
                       <div className="flex items-center gap-2 mb-4 px-2">
                           <div className="w-8 h-8 rounded-full bg-stone-700 text-stone-300 flex items-center justify-center">
                               <Archive className="w-4 h-4" />
                           </div>
                           <div>
                               <span className="text-xs uppercase text-stone-400 tracking-widest block font-bold">Your Letter</span>
                               <span className="text-[10px] text-stone-600">Written on {new Date(selectedLetter.createdAt).toLocaleDateString()}</span>
                           </div>
                       </div>
                       
                       <div className={`p-6 rounded-2xl border min-h-[150px] relative transition-all ${
                           Date.now() < selectedLetter.sendDate 
                           ? 'bg-black/40 border-stone-800/50' 
                           : 'bg-white/5 border-white/10'
                       }`}>
                           {Date.now() < selectedLetter.sendDate ? (
                               <div className="flex flex-col items-center justify-center h-full py-8 space-y-3">
                                   <Lock className="w-8 h-8 text-stone-600" />
                                   <p className="text-stone-500 font-serif text-sm">此信件正在时间长河中旅行...</p>
                                   <span className="text-xs text-stone-700 font-sans tracking-widest border border-stone-800 px-2 py-1 rounded">
                                       解锁日期: {new Date(selectedLetter.sendDate).toLocaleDateString()}
                                   </span>
                                   {/* Blur Effect Overlay */}
                                   <div className="absolute inset-0 backdrop-blur-sm rounded-2xl pointer-events-none"></div>
                               </div>
                           ) : (
                               <>
                                   {/* Notification Banner for newly unlocked */}
                                   <div className="bg-lucid-glow/10 text-lucid-glow text-xs px-3 py-1.5 rounded-lg inline-flex items-center mb-4 border border-lucid-glow/20">
                                       <Unlock className="w-3 h-3 mr-2" />
                                       <span>来自过去的信件已送达</span>
                                   </div>
                                   <p className="text-stone-300 font-serif leading-loose whitespace-pre-wrap">
                                       {selectedLetter.content}
                                   </p>
                               </>
                           )}
                       </div>
                  </div>
              </div>
          )}
      </Modal>
    </div>
  );
};

export default ArchiveView;