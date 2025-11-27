import React, { useState, useEffect, useMemo } from 'react';
import { Wish } from '../types';
import { Play, Pause, Image as ImageIcon, Music, Type, Download, Volume2, Sparkles, Layers, Disc, X, SkipBack, SkipForward, Shuffle, Repeat, Repeat1 } from 'lucide-react';
import { generateVisionImage, generateTTS } from '../services/geminiService';
import { Button, Card, SectionTitle, LoadingSpinner, TabNav } from './Shared';

interface ToolsViewProps {
  wish: Wish;
  wishes?: Wish[]; // Passed for playlist functionality
  onUpdateWish: (updatedWish: Wish) => void;
}

type EngineTab = 'subliminal' | 'affirmation' | 'vision';

const ToolsView: React.FC<ToolsViewProps> = ({ wish, wishes = [], onUpdateWish }) => {
  const [activeTab, setActiveTab] = useState<EngineTab>('subliminal');
  
  // --- Audio State ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrackType, setActiveTrackType] = useState<string | null>(null); // 'subliminal' | 'tts' | 'bgm'
  const [playingWishId, setPlayingWishId] = useState<string | null>(null);
  
  const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
  
  // Audio Player for Blob (HTML5 Audio)
  const [blobAudioEl, setBlobAudioEl] = useState<HTMLAudioElement | null>(null);

  // Playlist Logic
  const playlist = useMemo(() => wishes.filter(w => w.subliminalAudioBlob), [wishes]);
  const [isShuffle, setIsShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'all' | 'one'>('all');

  // --- Vision State ---
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [visionMode, setVisionMode] = useState<'realistic' | 'particle' | 'collage'>('realistic');

  useEffect(() => {
      return () => {
          if (blobAudioEl) {
              blobAudioEl.pause();
          }
          if (audioSource) {
              try { audioSource.stop(); } catch(e){}
          }
      }
  }, []);

  // --- Helpers ---
  const playTTS = async (text: string) => {
    stopAllAudio();

    try {
      const buffer = await generateTTS(text, 'Kore');
      if (buffer) {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start();
        setAudioSource(source);
        setIsPlaying(true);
        setActiveTrackType('tts');
        setPlayingWishId(wish.id); // TTS belongs to current view wish
        source.onended = () => {
            setIsPlaying(false);
            setActiveTrackType(null);
        };
      }
    } catch (e) { console.error("Audio playback failed", e); }
  };

  const stopAllAudio = () => {
    if (audioSource) {
        try { audioSource.stop(); } catch(e) {}
        setAudioSource(null);
    }
    if (blobAudioEl) {
        blobAudioEl.pause();
    }
    setIsPlaying(false);
  }

  const playBlob = (blob: Blob, type: string, wishId: string) => {
      // If clicking same track...
      if (playingWishId === wishId && activeTrackType === type && blobAudioEl) {
          if (blobAudioEl.paused) {
             blobAudioEl.play();
             setIsPlaying(true);
          } else {
             blobAudioEl.pause();
             setIsPlaying(false);
          }
          return;
      }
      
      // Stop previous
      if (blobAudioEl) {
          blobAudioEl.pause();
          blobAudioEl.src = '';
      }
      if (audioSource) try { audioSource.stop(); } catch(e){}

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.loop = repeatMode === 'one'; 
      
      audio.onended = () => {
          if (repeatMode === 'one') {
              audio.play();
          } else {
              handleNext(); // Auto play next
          }
      };

      audio.play();
      setBlobAudioEl(audio);
      setIsPlaying(true);
      setActiveTrackType(type);
      setPlayingWishId(wishId);
      
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
  };

  // --- Playlist Navigation ---
  const getCurrentIndex = () => playlist.findIndex(w => w.id === playingWishId);

  const handleNext = () => {
      if (playlist.length === 0) return;
      const currentIndex = getCurrentIndex();
      
      let nextIndex;
      if (isShuffle) {
          nextIndex = Math.floor(Math.random() * playlist.length);
      } else {
          nextIndex = (currentIndex + 1) % playlist.length;
      }
      
      const nextWish = playlist[nextIndex];
      if (nextWish.subliminalAudioBlob) {
          playBlob(nextWish.subliminalAudioBlob, 'subliminal', nextWish.id);
      }
  };

  const handlePrev = () => {
      if (playlist.length === 0) return;
      const currentIndex = getCurrentIndex();
      
      let prevIndex = (currentIndex - 1 + playlist.length) % playlist.length;
      if (isShuffle) {
          prevIndex = Math.floor(Math.random() * playlist.length);
      }
      
      const prevWish = playlist[prevIndex];
      if (prevWish.subliminalAudioBlob) {
          playBlob(prevWish.subliminalAudioBlob, 'subliminal', prevWish.id);
      }
  };
  
  const toggleShuffle = () => setIsShuffle(!isShuffle);
  
  const toggleRepeat = () => {
      const newMode = repeatMode === 'all' ? 'one' : 'all';
      setRepeatMode(newMode);
      if (blobAudioEl) {
          blobAudioEl.loop = (newMode === 'one');
      }
  };

  const generateVisuals = async () => {
    setIsGeneratingImg(true);
    const img = await generateVisionImage(wish.beliefs.newIdentity, visionMode);
    if (img) onUpdateWish({ ...wish, visionImage: img });
    setIsGeneratingImg(false);
  };
  
  const getFilename = (w: Wish, prefix: string) => {
      const title = w.audioTitle || 'LUCID_Audio';
      const safeTitle = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_');
      return `${safeTitle}.wav`;
  }

  // --- Sticky Player UI ---
  const StickyPlayer = () => {
      if (!playingWishId && !activeTrackType) return null;
      
      const currentPlayingWish = wishes.find(w => w.id === playingWishId) || wish;
      
      let title = "Audio";
      if (activeTrackType === 'subliminal' && currentPlayingWish.audioTitle) title = currentPlayingWish.audioTitle;
      else if (activeTrackType === 'subliminal') title = "专属潜意识音频";
      else if (activeTrackType === 'bgm') title = "背景音乐";
      else if (activeTrackType === 'tts') title = "肯定语导读";

      return (
        <div className="fixed bottom-0 left-0 right-0 p-4 z-[60] pointer-events-none">
            <div className="max-w-md mx-auto bg-black/80 backdrop-blur-xl border border-white/10 rounded-full p-2 flex items-center gap-4 shadow-2xl pointer-events-auto pr-6">
                {/* Visualizer / Icon */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${isPlaying ? 'animate-spin-slow' : ''} ${activeTrackType === 'subliminal' ? 'bg-gradient-to-tr from-orange-500 to-rose-500' : 'bg-white/10'}`}>
                   {activeTrackType === 'subliminal' ? <Disc className="w-6 h-6 text-white"/> : <Volume2 className="w-6 h-6 text-white"/>}
                </div>

                <div className="flex-1 min-w-0">
                    <div className="text-white text-sm font-serif truncate">{title}</div>
                    <div className="text-[10px] text-stone-400 font-sans tracking-wider uppercase">
                         {isPlaying ? 'Playing...' : 'Paused'}
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                     {activeTrackType === 'subliminal' && (
                         <button onClick={handlePrev} className="text-stone-400 hover:text-white"><SkipBack className="w-5 h-5"/></button>
                     )}
                     
                     <button 
                        onClick={() => {
                            if (blobAudioEl) isPlaying ? blobAudioEl.pause() : blobAudioEl.play();
                            if (audioSource) stopAllAudio(); // TTS usually just stops
                        }}
                        className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
                     >
                        {isPlaying ? <Pause className="w-4 h-4 fill-current"/> : <Play className="w-4 h-4 fill-current ml-1"/>}
                     </button>

                     {activeTrackType === 'subliminal' && (
                        <button onClick={handleNext} className="text-stone-400 hover:text-white"><SkipForward className="w-5 h-5"/></button>
                     )}
                     
                     <button onClick={stopAllAudio} className="text-stone-500 hover:text-rose-400"><X className="w-5 h-5"/></button>
                </div>
            </div>
        </div>
      );
  };

  return (
    <div className="w-full h-full flex flex-col relative">
        <SectionTitle title="能量工具" subtitle="TOOLS · 频率调频" />
        
        <TabNav 
            activeTab={activeTab}
            onTabChange={setActiveTab}
            tabs={[
                { id: 'subliminal', icon: Layers, label: '潜意识音频' },
                { id: 'affirmation', icon: Type, label: '肯定语' },
                { id: 'vision', icon: ImageIcon, label: '视觉显化' }
            ]}
        />
        
        <div className="flex-1 overflow-y-auto px-4 pb-32 custom-scrollbar animate-fade-in">
             <div className="max-w-2xl mx-auto space-y-6">
                 
                 {/* 1. SUBLIMINAL TAB */}
                 {activeTab === 'subliminal' && (
                    <div className="space-y-6">
                        {wish.subliminalAudioBlob ? (
                            <Card className="relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-6 opacity-20">
                                    <Disc className="w-32 h-32 animate-spin-slow text-lucid-glow" />
                                </div>
                                
                                <span className="text-xs text-lucid-glow uppercase tracking-widest block mb-1">Current Frequency</span>
                                <h3 className="text-xl font-serif text-white mb-6">{wish.audioTitle || "专属潜意识音频"}</h3>
                                
                                <div className="flex gap-3">
                                    <Button 
                                        onClick={() => playBlob(wish.subliminalAudioBlob!, 'subliminal', wish.id)} 
                                        variant="primary" 
                                        className="rounded-full px-8"
                                    >
                                        {(isPlaying && playingWishId === wish.id) ? <Pause className="w-5 h-5 mr-2"/> : <Play className="w-5 h-5 mr-2"/>}
                                        播放
                                    </Button>
                                    <a href={URL.createObjectURL(wish.subliminalAudioBlob)} download={getFilename(wish, 'Subliminal')}>
                                        <Button variant="glass" className="rounded-full px-4"><Download className="w-5 h-5"/></Button>
                                    </a>
                                </div>

                                {/* Mixing Info */}
                                <div className="mt-6 pt-4 border-t border-white/5 flex gap-6 text-sm text-stone-400">
                                    <span>Mix: <span className="text-white capitalize">{wish.mixingMode}</span></span>
                                    <span>Theme: <span className="text-white">{wish.themeMusicType || "None"}</span></span>
                                </div>
                            </Card>
                        ) : (
                            <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
                                <p className="text-stone-500">暂无生成的潜意识音频</p>
                            </div>
                        )}

                        {/* Mini Playlist */}
                        {wishes.length > 0 && (
                            <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-serif text-white uppercase tracking-wider">播放列表 Playlist</h4>
                                    <div className="flex gap-2">
                                        <button onClick={toggleShuffle} className={`p-1.5 rounded-lg transition-colors ${isShuffle ? 'text-lucid-glow bg-lucid-glow/10' : 'text-stone-500 hover:text-white'}`}><Shuffle className="w-4 h-4"/></button>
                                        <button onClick={toggleRepeat} className={`p-1.5 rounded-lg transition-colors ${repeatMode === 'one' ? 'text-lucid-glow bg-lucid-glow/10' : 'text-stone-500 hover:text-white'}`}>
                                            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4"/> : <Repeat className="w-4 h-4"/>}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar">
                                    {playlist.map(w => (
                                        <div 
                                            key={w.id} 
                                            onClick={() => w.subliminalAudioBlob && playBlob(w.subliminalAudioBlob, 'subliminal', w.id)}
                                            className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${playingWishId === w.id ? 'bg-lucid-glow/10 border border-lucid-glow/20' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${playingWishId === w.id ? 'bg-lucid-glow text-lucid-bg' : 'bg-white/10 text-stone-500'}`}>
                                                    {playingWishId === w.id && isPlaying ? <div className="w-3 h-3 bg-current rounded-sm animate-pulse"></div> : <Play className="w-3 h-3 ml-0.5 fill-current"/>}
                                                </div>
                                                <div className="truncate">
                                                    <div className={`text-sm font-serif truncate ${playingWishId === w.id ? 'text-lucid-glow' : 'text-stone-300'}`}>{w.audioTitle || w.content}</div>
                                                </div>
                                            </div>
                                            <span className="text-[10px] text-stone-600 flex-shrink-0">{new Date(w.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                 )}

                 {/* 2. AFFIRMATION TAB */}
                 {activeTab === 'affirmation' && (
                     <div className="space-y-4">
                         <div className="flex justify-between items-center mb-2">
                             <h3 className="text-white font-serif">植入意图 Affirmations</h3>
                             <Button onClick={() => playTTS(wish.affirmations.map(a => a.text).join('. '))} variant="glass" className="text-xs px-4 py-2 rounded-full">
                                 <Volume2 className="w-4 h-4 mr-2"/> 全部朗读
                             </Button>
                         </div>
                         {wish.affirmations.map((aff, i) => (
                             <Card key={i} className="flex gap-4 items-start group hover:bg-white/5 transition-colors">
                                 <button 
                                    onClick={() => playTTS(aff.text)}
                                    className="mt-1 w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-stone-400 group-hover:bg-lucid-glow group-hover:text-lucid-bg transition-all"
                                 >
                                     <Volume2 className="w-4 h-4" />
                                 </button>
                                 <div>
                                     <span className={`text-[10px] uppercase tracking-widest block mb-1 ${
                                         aff.type === 'conscious' ? 'text-orange-300' : aff.type === 'subconscious' ? 'text-rose-300' : 'text-emerald-300'
                                     }`}>
                                         {aff.type}
                                     </span>
                                     <p className="text-stone-200 font-serif leading-relaxed text-lg">{aff.text}</p>
                                 </div>
                             </Card>
                         ))}
                     </div>
                 )}

                 {/* 3. VISION TAB */}
                 {activeTab === 'vision' && (
                     <div className="space-y-6">
                         <div className="aspect-square md:aspect-video w-full rounded-3xl overflow-hidden bg-black/20 border border-white/10 relative group">
                             {wish.visionImage ? (
                                 <>
                                     <img src={wish.visionImage} alt="Vision" className="w-full h-full object-cover" />
                                     <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                                         <a href={wish.visionImage} download={`Vision_${wish.id}.png`}>
                                             <Button variant="primary" className="rounded-full"><Download className="w-5 h-5 mr-2"/> 下载壁纸</Button>
                                         </a>
                                     </div>
                                 </>
                             ) : (
                                 <div className="w-full h-full flex flex-col items-center justify-center text-stone-500 gap-4">
                                     <ImageIcon className="w-12 h-12 opacity-20" />
                                     <p>暂无视觉显化图</p>
                                 </div>
                             )}
                             
                             {isGeneratingImg && (
                                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
                                     <LoadingSpinner />
                                 </div>
                             )}
                         </div>

                         <div className="bg-white/5 rounded-2xl p-6 border border-white/5">
                             <div className="flex gap-2 mb-4 overflow-x-auto pb-2 no-scrollbar">
                                 {['realistic', 'particle', 'collage'].map(mode => (
                                     <button
                                         key={mode}
                                         onClick={() => setVisionMode(mode as any)}
                                         className={`px-4 py-2 rounded-full text-xs font-serif capitalize border transition-all whitespace-nowrap ${
                                             visionMode === mode 
                                             ? 'bg-white text-black border-white' 
                                             : 'text-stone-400 border-white/10 hover:border-white/30'
                                         }`}
                                     >
                                         {mode} Style
                                     </button>
                                 ))}
                             </div>
                             <Button onClick={generateVisuals} disabled={isGeneratingImg} variant="primary" className="w-full rounded-xl py-3">
                                 {isGeneratingImg ? <LoadingSpinner/> : <><Sparkles className="w-4 h-4 mr-2"/> {wish.visionImage ? '重新生成' : '生成显化图'}</>}
                             </Button>
                             <p className="text-center text-xs text-stone-500 mt-3">基于你的 "新身份" 和愿望关键词生成</p>
                         </div>
                     </div>
                 )}
             </div>
        </div>
        
        <StickyPlayer />
    </div>
  );
};

export default ToolsView;