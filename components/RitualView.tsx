import React, { useState, useEffect, useRef } from 'react';
import { generateTarotReading, generateDailyPractice, analyzeJournalEntry } from '../services/geminiService';
import { TarotReading, DailyPractice, JournalEntry, Wish } from '../types';
import { Button, Card, SectionTitle, LoadingSpinner, TabNav } from './Shared';
import { CreditCard, Sun, BookOpen, Shuffle, RotateCcw, Send, Sparkles } from 'lucide-react';

interface RitualViewProps {
    wishes?: Wish[];
    onAddJournalEntry: (entry: JournalEntry) => void;
}

// Full 78 Cards Data Generator (Chinese)
const generateTarotDeck = () => {
    const majors = [
        "愚者", "魔术师", "女祭司", "女皇", "皇帝", 
        "教皇", "恋人", "战车", "力量", "隐士", 
        "命运之轮", "正义", "倒吊人", "死神", "节制", 
        "恶魔", "高塔", "星星", "月亮", "太阳", 
        "审判", "世界"
    ];
    const suits = ["权杖", "圣杯", "宝剑", "星币"];
    const ranks = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "侍从", "骑士", "王后", "国王"];
    
    let deck: { id: number; name: string; isReversed: boolean }[] = [];
    let idCounter = 0;

    majors.forEach(m => deck.push({ id: idCounter++, name: m, isReversed: false }));
    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push({ id: idCounter++, name: `${suit}${rank}`, isReversed: false });
        });
    });
    return deck;
};

const RitualView: React.FC<RitualViewProps> = ({ wishes = [], onAddJournalEntry }) => {
  const [activeTab, setActiveTab] = useState<'tarot' | 'practice' | 'journal'>('tarot');
  const [loading, setLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Tarot State
  const [deck, setDeck] = useState(generateTarotDeck());
  const [isShuffling, setIsShuffling] = useState(false);
  const [hasShuffled, setHasShuffled] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isRevealing, setIsRevealing] = useState(false); // New state for animation
  const [reading, setReading] = useState<TarotReading | null>(null);

  // Positioning State
  const deckScrollRef = useRef<HTMLDivElement>(null);
  
  // Practice State
  const [practice, setPractice] = useState<DailyPractice | null>(null);

  // Journal State
  const [journalInput, setJournalInput] = useState('');
  const [journalAnalysis, setJournalAnalysis] = useState<JournalEntry['aiAnalysis'] | null>(null);

  // Persistence Key Helper
  const getTodayKey = () => new Date().toLocaleDateString('zh-CN');

  // Load from LocalStorage on mount
  useEffect(() => {
      const savedReading = localStorage.getItem(`lucid_tarot_${getTodayKey()}`);
      const savedPractice = localStorage.getItem(`lucid_practice_${getTodayKey()}`);
      const savedJournal = localStorage.getItem(`lucid_journal_${getTodayKey()}`);

      if (savedReading) {
          try {
              const parsedReading = JSON.parse(savedReading);
              setReading(parsedReading);
              setHasShuffled(true);
          } catch(e) { console.error(e) }
      }

      if (savedPractice) {
          try {
              setPractice(JSON.parse(savedPractice));
          } catch(e) { console.error(e) }
      }

       if (savedJournal) {
          try {
              const data = JSON.parse(savedJournal);
              setJournalInput(data.content || '');
              setJournalAnalysis(data.analysis || null);
          } catch(e) { console.error(e) }
      }
  }, []);

  // Auto-scroll to center of deck when shuffled
  useEffect(() => {
      if (hasShuffled && deckScrollRef.current) {
          const container = deckScrollRef.current;
          setTimeout(() => {
            // Scroll to center: (Total Width - Viewport Width) / 2
            container.scrollTo({
                left: (container.scrollWidth - container.clientWidth) / 2,
                behavior: 'smooth'
            });
          }, 300);
      }
  }, [hasShuffled]);

  // --- Handlers ---
  const handleShuffle = () => {
      setIsShuffling(true);
      setReading(null);
      setSelectedIndices([]);
      setIsRevealing(false);
      setPractice(null); 
      
      setTimeout(() => {
          const newDeck = [...deck];
          // Fisher-Yates Shuffle + Random Reversal
          for (let i = newDeck.length - 1; i > 0; i--) {
              const j = Math.floor(Math.random() * (i + 1));
              [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
              newDeck[i].isReversed = Math.random() > 0.5; // 50% chance reversal
          }
          setDeck(newDeck);
          setIsShuffling(false);
          setHasShuffled(true);
      }, 1000);
  };

  const handleCardClick = async (index: number) => {
      if (selectedIndices.length >= 3 || selectedIndices.includes(index) || isRevealing || loading) return;
      
      const newSelected = [...selectedIndices, index];
      setSelectedIndices(newSelected);

      // If 3 cards selected, trigger animation and loading sequence
      if (newSelected.length === 3) {
          setIsRevealing(true); 
          setLoading(true); // Start loading state immediately to show connection

          // Prepare API payload
          const drawnCards = newSelected.map((deckIndex, i) => ({
              name: deck[deckIndex].name,
              isReversed: deck[deckIndex].isReversed,
              position: i === 0 ? 'body' : i === 1 ? 'mind' : 'spirit'
          })) as any; 

          try {
              // 2. Parallel Execution:
              // Enforce a minimum display time (e.g., 2s) so the user can enjoy the card reveal visuals
              // without an abrupt jump, while the API fetches data in the background.
              const minWaitPromise = new Promise(resolve => setTimeout(resolve, 2000));
              const apiPromise = generateTarotReading(drawnCards, wishes);
              
              const [_, generatedReading] = await Promise.all([minWaitPromise, apiPromise]);
              
              setReading(generatedReading);
              localStorage.setItem(`lucid_tarot_${getTodayKey()}`, JSON.stringify(generatedReading));
              
              // Auto-generate Daily Practice based on this reading (background)
              const context = `${generatedReading.guidance}. Cards: ${generatedReading.cards.map(c => c.name).join(', ')}`;
              generateDailyPractice(context).then(dp => {
                 setPractice(dp);
                 localStorage.setItem(`lucid_practice_${getTodayKey()}`, JSON.stringify(dp));
              });

          } catch (error) {
              console.error("Reading failed", error);
          } finally {
              setLoading(false);
              setIsRevealing(false);
          }
      }
  };

  const resetTarot = () => {
      // Direct reset without window.confirm to improve responsiveness
      setHasShuffled(false);
      setSelectedIndices([]);
      setReading(null);
      setPractice(null);
      setIsRevealing(false);
      setDeck(generateTarotDeck()); // Regenerate deck state
      localStorage.removeItem(`lucid_tarot_${getTodayKey()}`);
      localStorage.removeItem(`lucid_practice_${getTodayKey()}`);
      
      // Scroll to top to ensure user sees the shuffle view
      if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
      }
  };

  const handleJournalSubmit = async () => {
    if (!journalInput) return;
    setLoading(true);
    const analysis = await analyzeJournalEntry(journalInput);
    if (analysis) {
        setJournalAnalysis(analysis);
        
        // Save for current session/today view
        localStorage.setItem(`lucid_journal_${getTodayKey()}`, JSON.stringify({
            content: journalInput,
            analysis: analysis
        }));

        // Archive globally
        const newEntry: JournalEntry = {
            id: crypto.randomUUID(),
            date: Date.now(),
            content: journalInput,
            aiAnalysis: analysis
        };
        onAddJournalEntry(newEntry);
    }
    setLoading(false);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <SectionTitle title="每日仪式" subtitle="RITUAL · 能量校准" />

      {/* New Sleek Navigation */}
      <TabNav 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
            { id: 'tarot', icon: CreditCard, label: '灵感塔罗' },
            { id: 'practice', icon: Sun, label: '今日指引' },
            { id: 'journal', icon: BookOpen, label: '觉察日记' }
        ]}
      />

      {/* Removed custom-scrollbar, added no-scrollbar to hide the vertical slider specifically */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-20 no-scrollbar animate-fade-in relative">
        <div className="max-w-4xl mx-auto w-full">
            {/* 1. TAROT */}
            {activeTab === 'tarot' && (
            <div className="flex flex-col items-center min-h-[500px]">
                
                {/* Initial State: Prompt Shuffle */}
                {!hasShuffled && !loading && !reading && (
                    <div className="flex flex-col items-center justify-center space-y-6 mt-12 animate-fade-in">
                        <div className="relative group cursor-pointer" onClick={handleShuffle}>
                            <div className="w-48 h-72 bg-gradient-to-br from-stone-800 to-stone-900 border border-white/20 rounded-2xl flex items-center justify-center shadow-2xl relative z-10 transition-transform duration-500 group-hover:-translate-y-2">
                                <div className="text-center">
                                    <Shuffle className={`w-10 h-10 text-lucid-glow mx-auto mb-3 ${isShuffling ? 'animate-spin' : ''}`} />
                                    <h3 className="text-xl font-serif text-white tracking-widest">一键洗牌</h3>
                                    <p className="text-xs text-lucid-dim mt-2 tracking-wider opacity-60">78 Cards Deck</p>
                                </div>
                            </div>
                            {/* Stack Effect */}
                            <div className="absolute top-2 left-2 w-48 h-72 bg-stone-800/50 rounded-2xl border border-white/10 -z-10"></div>
                            <div className="absolute top-4 left-4 w-48 h-72 bg-stone-800/30 rounded-2xl border border-white/5 -z-20"></div>
                        </div>
                        <p className="text-stone-400 font-serif italic text-sm">点击洗牌，注入你的能量...</p>
                    </div>
                )}

                {/* Shuffling Animation State */}
                {isShuffling && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm rounded-3xl">
                        <LoadingSpinner />
                    </div>
                )}

                {/* Deck Spread Selection & Reveal Animation */}
                {/* Note: We keep this visible even when `loading` is true to maintain the reveal animation state */}
                {hasShuffled && !reading && (
                    <div className="w-full animate-fade-in mt-4 flex flex-col items-center relative">
                        
                        <div className={`text-center mb-4 transition-opacity duration-500 ${isRevealing ? 'opacity-0' : 'opacity-100'}`}>
                            <h3 className="text-xl font-serif text-white">请凭直觉抽取三张牌</h3>
                            <p className="text-lucid-dim text-sm mt-1">{selectedIndices.length} / 3 已选择</p>
                        </div>
                        
                        {/* Horizontal Scroll Container for Arc Spread */}
                        <div ref={deckScrollRef} className="w-full overflow-x-auto overflow-y-visible no-scrollbar pb-32 pt-48 px-8 flex justify-center min-h-[500px]">
                            <div className="flex items-end min-w-max h-40 relative" style={{ marginLeft: '-1rem' }}> 
                                {deck.map((card, idx) => {
                                    const isSelected = selectedIndices.includes(idx);
                                    const selectedOrder = selectedIndices.indexOf(idx); // 0, 1, or 2
                                    
                                    // Layout Logic: Center (index 39) is highest.
                                    const centerIndex = 39; 
                                    const distFromCenter = idx - centerIndex;
                                    
                                    // Parabolic Arc: Highest in middle (negative Y is up)
                                    // y = x^2 / k. At edges (x=39), drop should be significant.
                                    const arcLift = 80; // How much to lift the center
                                    const yDrop = Math.pow(Math.abs(distFromCenter), 2) / 12;
                                    const normalTranslateY = -1 * arcLift + yDrop;
                                    const normalRotate = distFromCenter * 1.1; // Smooth rotation

                                    // Reveal State Styles (Center the 3 cards)
                                    let style: React.CSSProperties = {};

                                    if (isRevealing) {
                                        if (isSelected) {
                                            // Move selected cards to center using fixed positioning to ignore scroll/container bounds
                                            const offsetX = (selectedOrder - 1) * 140; // Spacing between cards (-140, 0, 140)
                                            style = {
                                                position: 'fixed',
                                                top: '50%',
                                                left: '50%',
                                                // Center horizontally and vertically relative to viewport, then apply offset
                                                transform: `translate(calc(-50% + ${offsetX}px), -50%) scale(1.1) rotate(0deg)`,
                                                zIndex: 1000,
                                                opacity: 1,
                                                transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                                marginLeft: 0,
                                                pointerEvents: 'none'
                                            };
                                        } else {
                                            // Fade out others
                                            style = {
                                                transform: `translateY(${normalTranslateY}px) rotate(${normalRotate}deg) scale(0.8)`,
                                                opacity: 0,
                                                transition: 'all 0.5s ease-out',
                                                pointerEvents: 'none'
                                            };
                                        }
                                    } else {
                                        // Normal Arc Interaction
                                        style = {
                                            transform: isSelected 
                                                ? `translateY(-120px) rotate(0deg) scale(1.1)` 
                                                : `translateY(${normalTranslateY}px) rotate(${normalRotate}deg)`,
                                            zIndex: isSelected ? 100 : 80 - Math.abs(distFromCenter),
                                            opacity: 1,
                                            position: 'relative'
                                        };
                                    }

                                    return (
                                        <div 
                                            key={card.id}
                                            onClick={() => handleCardClick(idx)}
                                            style={{ 
                                                ...style,
                                                // Only apply negative margin if NOT revealing/selected
                                                marginLeft: (isRevealing && isSelected) ? 0 : (idx === 0 ? '0' : '-1.8rem'),
                                            }}
                                            className={`
                                                w-16 h-28 md:w-24 md:h-36 rounded-xl border border-white/20 cursor-pointer shadow-xl transition-all duration-300 origin-bottom
                                                ${!isRevealing && !isSelected ? 'hover:z-[99] hover:-translate-y-16 hover:scale-110 hover:shadow-[0_0_30px_rgba(253,186,116,0.5)] hover:bg-stone-700/80 hover:border-lucid-glow/50' : ''}
                                                bg-stone-800 flex-shrink-0 relative overflow-hidden
                                                ${isSelected ? 'ring-2 ring-lucid-glow shadow-[0_0_20px_rgba(253,186,116,0.3)] bg-stone-700' : ''}
                                            `}
                                        >
                                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none"></div>
                                            <div className="w-full h-full opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-orange-900 to-black"></div>
                                            <div className="absolute inset-2 border border-white/5 rounded-md opacity-50"></div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Loading Overlay */}
                        {loading && (
                            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 translate-y-24 z-[1001] flex flex-col items-center pointer-events-none w-full">
                                <LoadingSpinner />
                                <p className="text-lucid-dim font-serif mt-3 text-sm tracking-widest animate-pulse drop-shadow-md bg-black/40 px-4 py-1 rounded-full backdrop-blur-sm">
                                    连接潜意识频率...
                                </p>
                            </div>
                        )}
                    </div>
                )}
                
                {/* Result Display */}
                {reading && (
                    <div className="w-full space-y-10 animate-fade-in pb-10">
                        {/* 3 Cards Reveal */}
                        <div className="flex flex-col md:flex-row justify-center gap-6 mt-4">
                            {reading.cards.map((card, idx) => (
                                <div key={idx} className="relative w-full md:w-56 h-[26rem] group perspective-1000 animate-fade-in" style={{animationDelay: `${idx * 0.2}s`}}>
                                    <div className={`relative w-full h-full bg-white/5 backdrop-blur-xl border border-white/20 rounded-2xl p-5 flex flex-col items-center shadow-2xl transition-all duration-700 ${card.isReversed ? 'rotate-180' : ''}`}>
                                        
                                        {/* Image Placeholder or Gen */}
                                        <div className="absolute inset-0 rounded-2xl overflow-hidden opacity-30 mix-blend-overlay">
                                            <div className="w-full h-full bg-gradient-to-b from-stone-700 to-black"></div>
                                        </div>
                                        
                                        {/* Inner Content - Reversed back if card is reversed to keep text upright */}
                                        <div className={`${card.isReversed ? 'rotate-180' : ''} flex flex-col items-center z-10 relative h-full w-full justify-start`}>
                                            <span className="text-xs uppercase tracking-[0.2em] text-lucid-glow opacity-80 border border-lucid-glow/30 px-3 py-1 rounded-full bg-black/20 flex-shrink-0">
                                                {card.position}
                                            </span>
                                            <div className="my-3 text-center flex-shrink-0">
                                                <h4 className="text-xl font-serif text-white mb-2">{card.name}</h4>
                                                {card.isReversed ? (
                                                    <span className="text-xs text-rose-300 uppercase tracking-widest font-sans opacity-90">逆位 Reversed</span>
                                                ) : (
                                                    <span className="text-xs text-emerald-300 uppercase tracking-widest font-sans opacity-90">正位 Upright</span>
                                                )}
                                            </div>
                                            {/* Text Content - No Scroll - Refined Typography */}
                                            <div className="w-full flex-grow flex items-start mt-2 px-2">
                                                <p className="text-sm text-stone-100 font-serif leading-relaxed text-justify">
                                                    {card.meaning}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Interpretation */}
                        <div className="max-w-2xl mx-auto space-y-4">
                            <Card className="bg-gradient-to-b from-white/5 to-transparent border-t border-white/10">
                                <h4 className="text-lg font-serif text-lucid-glow mb-4 text-center">✨ 宇宙讯息</h4>
                                <p className="text-stone-200 font-serif leading-loose text-justify text-sm md:text-base">
                                    {reading.guidance}
                                </p>
                                <div className="mt-6 pt-4 border-t border-white/5 flex flex-col items-center">
                                    <span className="text-xs text-stone-500 uppercase tracking-widest mb-1">今日宜显化 · Focus Wish</span>
                                    <p className="text-white font-serif text-base">{reading.focusWishName || "当下"}</p>
                                </div>
                            </Card>

                            <div className="flex justify-center pt-2">
                                <Button onClick={resetTarot} variant="ghost" className="text-sm text-stone-500 hover:text-white">
                                    <RotateCcw className="w-4 h-4 mr-2" /> 开启新的解读
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            )}

            {/* 2. DAILY PRACTICE (Dependant on Tarot) */}
            {activeTab === 'practice' && (
            <div className="max-w-xl mx-auto py-6 animate-fade-in">
                {!practice ? (
                    <div className="text-center space-y-4 py-16 flex flex-col items-center">
                        <Sun className="w-12 h-12 text-stone-600 opacity-50" />
                        <div>
                            <h3 className="text-lg font-serif text-stone-300">今日能量未激活</h3>
                            <p className="text-stone-500 text-sm mt-1">请先进行“灵感塔罗”抽取，以获取专属指引。</p>
                        </div>
                        <Button onClick={() => setActiveTab('tarot')} variant="outline" className="rounded-full px-8 text-xs">
                            前往抽取
                        </Button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <Card className="text-center relative overflow-hidden group py-10">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-lucid-glow to-transparent opacity-50"></div>
                            <span className="text-xs font-sans tracking-widest text-stone-500 uppercase">今日能量场</span>
                            <h2 className="text-3xl font-serif text-white mt-2 mb-6">{practice.energyStatus}</h2>
                            
                            <div className="w-12 h-[1px] bg-white/10 mx-auto mb-6"></div>
                            
                            <span className="text-xs font-sans tracking-widest text-lucid-accent/80 uppercase block mb-2">今日肯定语</span>
                            <p className="text-xl text-lucid-glow font-serif italic opacity-90 px-4">
                                "{practice.todaysAffirmation}"
                            </p>
                        </Card>

                        <Card className="flex items-start gap-4">
                            <div className="p-2 bg-emerald-900/20 rounded-full text-emerald-400 mt-1">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-base font-bold text-emerald-100 mb-1">今日微行动</h4>
                                <p className="text-stone-300 font-serif leading-relaxed text-base">
                                    {practice.actionStep}
                                </p>
                            </div>
                        </Card>
                    </div>
                )}
            </div>
            )}

            {/* 3. JOURNAL */}
            {activeTab === 'journal' && (
            <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-10">
                <Card className="border-white/10 bg-gradient-to-b from-stone-800/20 to-transparent !p-4 md:!p-6">
                    <div className="flex items-center gap-2 mb-3 text-lucid-dim">
                        <BookOpen className="w-4 h-4" />
                        <span className="text-xs font-serif tracking-widest">觉察日记</span>
                    </div>
                    <textarea
                        className="w-full bg-black/20 rounded-xl p-4 text-base font-serif focus:outline-none min-h-[120px] text-stone-200 placeholder-stone-700 resize-none border border-white/5 focus:border-lucid-glow/20 transition-all leading-relaxed"
                        placeholder="记录当下的情绪、念头或梦境..."
                        value={journalInput}
                        onChange={(e) => setJournalInput(e.target.value)}
                    />
                    <div className="flex justify-end mt-3">
                        <Button onClick={handleJournalSubmit} disabled={loading || !journalInput.trim()} variant="glass" className="rounded-full px-5 py-2 text-sm">
                            {loading ? <LoadingSpinner /> : <><Send className="w-4 h-4 mr-2" /> AI 深度觉察</>}
                        </Button>
                    </div>
                </Card>

                {journalAnalysis && (
                    <div className="space-y-4 animate-fade-in">
                        <div className="flex gap-4">
                            <div className="flex-1 bg-white/5 rounded-2xl p-5 border border-white/5">
                                <span className="text-xs uppercase text-stone-500 tracking-wider block mb-2">情绪状态</span>
                                <div className="flex flex-wrap gap-2">
                                    {Array.isArray(journalAnalysis.emotionalState) ? (
                                        journalAnalysis.emotionalState.map((emotion, i) => (
                                            <span key={i} className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-sm border border-indigo-500/20 font-serif">
                                                {emotion}
                                            </span>
                                        ))
                                    ) : (
                                        // Legacy support for string
                                        <span className="inline-block px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-300 text-sm border border-indigo-500/20 font-serif">
                                            {journalAnalysis.emotionalState}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 bg-white/5 rounded-2xl p-5 border border-white/5">
                                <span className="text-xs uppercase text-stone-500 tracking-wider block mb-2">识别信念</span>
                                <div className="flex flex-wrap gap-2">
                                    {journalAnalysis.blocksIdentified?.map((b, i) => (
                                        <span key={i} className="text-xs bg-rose-500/10 text-rose-300 px-2 py-1 rounded">{b}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        
                        <Card className="bg-lucid-glow/5 border-lucid-glow/10 p-6">
                            <h4 className="text-sm font-serif text-lucid-glow mb-2">LUCID 洞见</h4>
                            <p className="text-stone-300 font-serif text-base leading-loose">
                                {journalAnalysis.summary}
                            </p>
                        </Card>

                        <Card className="bg-emerald-900/10 border-emerald-500/10 p-6">
                                <h4 className="text-sm font-serif text-emerald-300 mb-2">明日建议</h4>
                                <p className="text-stone-300 font-serif text-base leading-loose">
                                    {journalAnalysis.tomorrowsAdvice}
                                </p>
                        </Card>
                    </div>
                )}
            </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default RitualView;