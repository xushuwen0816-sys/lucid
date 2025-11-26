import React, { useState, useEffect } from 'react';
import { Wish } from '../types';
import { Play, Pause, Image as ImageIcon, Music, Type, Download, Volume2, Sparkles, Layers, Disc, X } from 'lucide-react';
import { generateVisionImage, generateTTS } from '../services/geminiService';
import { Button, Card, SectionTitle, LoadingSpinner, TabNav } from './Shared';

interface ToolsViewProps {
  wish: Wish;
  onUpdateWish: (updatedWish: Wish) => void;
}

type EngineTab = 'affirmation' | 'music' | 'subliminal' | 'vision';

const ToolsView: React.FC<ToolsViewProps> = ({ wish, onUpdateWish }) => {
  const [activeTab, setActiveTab] = useState<EngineTab>('subliminal');
  
  // --- Audio State ---
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTrack, setActiveTrack] = useState<string | null>(null); // 'subliminal' | 'tts' | 'bgm'
  const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
  
  // Audio Player for Blob (HTML5 Audio)
  const [blobAudioUrl, setBlobAudioUrl] = useState<string | null>(null);
  const [blobAudioEl, setBlobAudioEl] = useState<HTMLAudioElement | null>(null);

  // --- Vision State ---
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [visionMode, setVisionMode] = useState<'realistic' | 'particle' | 'collage'>('realistic');

  useEffect(() => {
      return () => {
          if (blobAudioUrl) URL.revokeObjectURL(blobAudioUrl);
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
        setActiveTrack('tts');
        source.onended = () => {
            setIsPlaying(false);
            setActiveTrack(null);
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
        // Do not reset time to 0 for resume capability
    }
    setIsPlaying(false);
    // Do not clear activeTrack immediately if we want to show paused state
  }

  const toggleBlob = (blob: Blob, type: string) => {
      // If clicking same track...
      if (activeTrack === type && blobAudioEl) {
          if (blobAudioEl.paused) {
             blobAudioEl.play();
             setIsPlaying(true);
          } else {
             blobAudioEl.pause();
             setIsPlaying(false);
          }
          return;
      }
      
      // If new track...
      playBlobNew(blob, type);
  }

  const playBlobNew = (blob: Blob, type: string) => {
      // Stop previous
      if (blobAudioEl) {
          blobAudioEl.pause();
          blobAudioEl.currentTime = 0; // Reset previous
      }
      if (audioSource) try { audioSource.stop(); } catch(e){}

      const url = URL.createObjectURL(blob);
      setBlobAudioUrl(url);
      const audio = new Audio(url);
      audio.loop = true;
      audio.play();
      setBlobAudioEl(audio);
      setIsPlaying(true);
      setActiveTrack(type);
      
      audio.onpause = () => setIsPlaying(false);
      audio.onplay = () => setIsPlaying(true);
  };

  const generateVisuals = async () => {
    setIsGeneratingImg(true);
    const img = await generateVisionImage(wish.beliefs.newIdentity, visionMode);
    if (img) onUpdateWish({ ...wish, visionImage: img });
    setIsGeneratingImg(false);
  };
  
  const getFilename = (prefix: string) => {
      const tag = wish.tags?.emotional?.[0] || 'Manifest';
      const cleanTag = tag.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '');
      return `LUCID_${prefix}_${cleanTag}.wav`;
  }

  // --- Sticky Player UI ---
  const StickyPlayer = () => {
      if (!activeTrack) return null;
      
      let title = "Audio";
      if (activeTrack === 'subliminal') title = "潜意识音频";
      if (activeTrack === 'bgm') title = "背景音乐";
      if (activeTrack === 'tts') title = "肯定语导读";

      return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white/10 backdrop-blur-2xl border border-white/20 rounded-full p-3 shadow-2xl flex items-center justify-between z-50 animate-fade-in">
              <div className="flex items-center gap-4 pl-2">
                  <div className={`w-10 h-10 rounded-full bg-lucid-glow/20 flex items-center justify-center ${isPlaying ? 'animate-[spin_4s_linear_infinite]' : ''}`}>
                      <Disc className="w-5 h-5 text-lucid-glow" />
                  </div>
                  <div>
                      <div className="text-xs text-lucid-dim font-sans uppercase tracking-widest">Playing</div>
                      <div className="text-base text-white font-serif">{title}</div>
                  </div>
              </div>

              <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                        if (activeTrack === 'tts') {
                           stopAllAudio();
                           setActiveTrack(null);
                        } else if (blobAudioEl) {
                            if(isPlaying) blobAudioEl.pause(); else blobAudioEl.play();
                        }
                    }}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform shadow-lg"
                  >
                      {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
                  </button>
                  <button onClick={() => { stopAllAudio(); setActiveTrack(null); }} className="p-3 text-lucid-dim hover:text-white transition-colors">
                      <X className="w-4 h-4" />
                  </button>
              </div>
          </div>
      )
  };

  return (
    <div className="max-w-6xl mx-auto w-full h-full flex flex-col relative pb-32">
      <SectionTitle title="显化工具" subtitle="TOOLS · 能量素材库" />

      {/* Engine Selector with new TabNav */}
      <TabNav 
        activeTab={activeTab}
        onTabChange={setActiveTab}
        tabs={[
          { id: 'subliminal', icon: Layers, label: '潜意识' },
          { id: 'affirmation', icon: Type, label: '肯定语' },
          { id: 'music', icon: Music, label: '音频' },
          { id: 'vision', icon: ImageIcon, label: '愿景' },
        ]}
      />

      {/* Content Area */}
      <div className="flex-1 px-4 animate-fade-in">
        
        {/* 1. SUBLIMINAL (Priority) */}
        {activeTab === 'subliminal' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <Card className="border-lucid-glow/30 shadow-[0_0_60px_rgba(253,186,116,0.05)] text-center py-16 px-8 rounded-[3rem] bg-gradient-to-b from-white/5 to-transparent">
               <div className="w-24 h-24 bg-gradient-to-tr from-lucid-glow/20 to-lucid-accent/10 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse-slow blur-[1px]">
                   <Layers className="w-10 h-10 text-white/90" />
               </div>
               <h3 className="font-serif text-3xl font-light text-white mb-2 tracking-wide">{wish.audioTitle || '专属潜意识音频'}</h3>
               <p className="text-lucid-dim font-serif text-xs tracking-widest mb-10 uppercase opacity-70">
                   {wish.themeMusicType} · {wish.mixingMode}
               </p>

               {wish.subliminalAudioBlob ? (
                   <div className="flex flex-col items-center gap-6">
                       <Button 
                          onClick={() => toggleBlob(wish.subliminalAudioBlob!, 'subliminal')} 
                          variant="primary" 
                          className="px-10 py-4 text-lg rounded-full w-64 shadow-2xl shadow-lucid-glow/20 hover:scale-105 transition-transform"
                       >
                           {isPlaying && activeTrack === 'subliminal' ? <span className="flex items-center gap-3"><Pause className="w-5 h-5 fill-current"/> 暂停播放</span> : <span className="flex items-center gap-3"><Play className="w-5 h-5 fill-current"/> 开始播放</span>}
                       </Button>
                       <a href={URL.createObjectURL(wish.subliminalAudioBlob)} download={getFilename('Subliminal')}>
                         <button className="text-xs text-stone-500 hover:text-white flex items-center gap-2 border-b border-transparent hover:border-white/20 pb-1 transition-all">
                             <Download className="w-3 h-3" /> 下载音频文件 (.wav)
                         </button>
                       </a>
                   </div>
               ) : (
                   <div className="text-stone-500 font-serif italic text-sm">
                       未找到生成的音频，请在“愿望”中重新创建流程。
                   </div>
               )}
            </Card>
          </div>
        )}

        {/* 2. AFFIRMATION ENGINE */}
        {activeTab === 'affirmation' && (
          <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto">
              <div className="col-span-full mb-2">
                  <h3 className="text-xl font-serif text-lucid-glow flex items-center gap-2 justify-center opacity-80">
                     <Sparkles className="w-5 h-5" /> 信念重塑
                  </h3>
              </div>
              {wish.affirmations.map((aff, idx) => (
                <div key={idx} className="group hover:bg-white/[0.08] bg-white/[0.03] backdrop-blur-md cursor-pointer relative overflow-hidden transition-all duration-500 rounded-[2rem] border border-white/5 p-8 flex flex-col justify-between min-h-[160px]">
                    <div>
                      <span className={`text-xs uppercase tracking-widest px-3 py-1 rounded-full bg-black/20 border border-white/5 font-sans ${
                        aff.type === 'conscious' ? 'text-orange-200' : aff.type === 'subconscious' ? 'text-rose-200' : 'text-emerald-200'
                      }`}>
                        {aff.type}
                      </span>
                      <p className="text-xl mt-4 font-serif leading-relaxed text-stone-200 group-hover:text-white transition-colors">
                        "{aff.text}"
                      </p>
                    </div>
                    <div className="flex justify-end mt-4 opacity-40 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" className="!p-3 hover:bg-white/20 rounded-full" onClick={() => playTTS(aff.text)}>
                        <Volume2 className="w-5 h-5" />
                      </Button>
                    </div>
                </div>
              ))}
          </div>
        )}

        {/* 3. MUSIC ENGINE */}
        {activeTab === 'music' && (
          <div className="max-w-xl mx-auto space-y-6">
             <Card className="text-center py-12 px-8 rounded-[3rem] bg-white/[0.02]">
                 <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Music className="w-8 h-8 text-stone-400" />
                 </div>
                 <h3 className="text-xl text-white font-serif mb-1">背景音乐</h3>
                 <p className="text-stone-400 mb-6 font-serif italic text-base">{wish.themeMusicType || '未生成'}</p>
                 {wish.musicAudioBlob ? (
                    <div className="flex flex-col items-center gap-4">
                       <Button onClick={() => toggleBlob(wish.musicAudioBlob!, 'bgm')} variant="glass" className="px-8 py-3 text-base rounded-full border-white/10 hover:border-white/30 w-full">
                          {isPlaying && activeTrack === 'bgm' ? <span className="flex items-center gap-2 justify-center"><Pause className="w-4 h-4 fill-current"/> 暂停</span> : <span className="flex items-center gap-2 justify-center"><Play className="w-4 h-4 fill-current"/> 试听背景音</span>}
                       </Button>
                       <a href={URL.createObjectURL(wish.musicAudioBlob)} download={getFilename('BGM')}>
                          <Button variant="outline" className="px-5 py-2 rounded-full text-xs border-transparent text-stone-500 hover:text-white"><Download className="w-3 h-3 mr-2"/> 下载</Button>
                       </a>
                    </div>
                 ) : (
                    <p className="text-xs text-stone-500">请在愿望向导中生成。</p>
                 )}
             </Card>
          </div>
        )}

        {/* 4. VISION ENGINE */}
        {activeTab === 'vision' && (
          <div className="flex flex-col items-center w-full max-w-4xl mx-auto">
            
            {/* Mode Selector */}
            <div className="flex gap-2 mb-8 bg-white/5 p-1.5 rounded-full border border-white/5 backdrop-blur-md">
              {[
                { id: 'realistic', label: '现实显化' },
                { id: 'particle', label: '能量场' },
                { id: 'collage', label: '拼贴壁纸' }
              ].map(m => (
                 <button 
                  key={m.id}
                  onClick={() => setVisionMode(m.id as any)}
                  className={`px-6 py-2 rounded-full text-xs font-sans tracking-widest transition-all duration-500 ${visionMode === m.id ? 'bg-white text-black shadow-lg scale-100' : 'text-stone-400 hover:text-white'}`}
                 >
                   {m.label}
                 </button>
              ))}
            </div>

            {wish.visionImage ? (
               <div className="relative w-full aspect-[16/9] rounded-[2rem] overflow-hidden shadow-[0_0_80px_rgba(253,186,116,0.05)] group border border-white/10">
                 <img src={wish.visionImage} alt="Vision" className="w-full h-full object-cover transition duration-1000 group-hover:scale-105" />
                 <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-4">
                    <Button variant="glass" onClick={generateVisuals} className="rounded-full px-8 text-sm">重新生成</Button>
                    <a href={wish.visionImage} download={`LUCID_Vision.png`}>
                        <Button variant="outline" className="rounded-full px-8 text-sm">下载壁纸</Button>
                    </a>
                 </div>
               </div>
            ) : (
               <div className="w-full aspect-[16/9] bg-white/5 rounded-[2rem] border border-white/5 flex flex-col items-center justify-center gap-4 group hover:bg-white/[0.07] transition-colors cursor-pointer" onClick={generateVisuals}>
                  <div className="p-6 rounded-full bg-white/5 group-hover:scale-110 transition-transform">
                      {isGeneratingImg ? <LoadingSpinner /> : <ImageIcon className="w-10 h-10 text-stone-500" />}
                  </div>
                  <p className="text-stone-500 font-serif text-base">点击生成愿景图</p>
               </div>
            )}
          </div>
        )}
      </div>

      <StickyPlayer />
    </div>
  );
};

export default ToolsView;