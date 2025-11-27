import React, { useRef, useEffect, useState } from 'react';
import { Send, Sparkles, ArrowRight, Play, Pause, Check, Music, Mic, Layers, X, Info } from 'lucide-react';
import { Wish, ChatMessage, IntentState } from '../types';
import { analyzeWishDeepDive, generateBeliefMapAndTags, generateAffirmations, generateTTS, generateSynthesizedMusic } from '../services/geminiService';
import { Button, Card, SectionTitle, LoadingSpinner } from './Shared';

interface IntentViewProps {
  state: IntentState;
  setState: React.Dispatch<React.SetStateAction<IntentState>>;
  onComplete: (wish: Wish) => void;
}

const IntentView: React.FC<IntentViewProps> = ({ state, setState, onComplete }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioSource, setAudioSource] = useState<AudioBufferSourceNode | null>(null);
  const [audioContext] = useState(() => new (window.AudioContext || (window as any).webkitAudioContext)());
  
  // Voice Recording State
  const [voiceMode, setVoiceMode] = useState<'ai' | 'user'>('ai');
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Auto-scroll for Chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, state.isTyping]);

  // Audio Playback Helper
  const stopAudio = () => {
    if (audioSource) {
      try { audioSource.stop(); } catch(e) {}
      setAudioSource(null);
    }
    setIsPlaying(false);
  };

  const playBuffer = (buffer: AudioBuffer, loop: boolean = false) => {
    if (isPlaying) {
        stopAudio();
        return; 
    }

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.loop = loop;
    source.playbackRate.value = 1.0; 
    source.connect(audioContext.destination);
    source.start();
    setAudioSource(source);
    setIsPlaying(true);
    source.onended = () => {
        if (!loop) setIsPlaying(false);
    };
  };
  
  useEffect(() => {
      return () => stopAudio();
  }, []);

  // Recording Logic
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      chunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            setState(prev => ({ ...prev, generatedVoiceAudio: audioBuffer }));
        };
        fileReader.readAsArrayBuffer(blob);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("无法访问麦克风");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 1. CHAT LOGIC
  const handleStartDeepDive = async () => {
    if (!state.wishInput.trim()) return;
    const initialText = state.wishInput;
    const initialMessage: ChatMessage = { role: 'user', text: initialText };
    setState(prev => ({ ...prev, step: 'deep-dive', wishInput: '', messages: [initialMessage], isTyping: true }));
    // Pass structured history
    const response = await analyzeWishDeepDive(initialText, [initialMessage]);
    setState(prev => ({ ...prev, messages: [...prev.messages, { role: 'model', text: response }], isTyping: false }));
  };

  const handleSendMessage = async () => {
    if (!state.wishInput.trim()) return;
    const textToSend = state.wishInput;
    const newMessage: ChatMessage = { role: 'user', text: textToSend };
    
    setState(prev => ({ ...prev, wishInput: '', messages: [...prev.messages, newMessage], isTyping: true }));
    
    // Pass structured history
    const history = [...state.messages, newMessage];
    const response = await analyzeWishDeepDive(textToSend, history);
    
    setState(prev => ({ ...prev, messages: [...prev.messages, { role: 'model', text: response }], isTyping: false }));
  };

  // 2. TRIGGER WIZARD
  const handleStartWizard = async () => {
    setIsLoading(true);
    try {
        const context = state.messages.map(m => `${m.role}: ${m.text}`).join('\n');
        const coreWish = state.messages[0].text;
        
        const { beliefs, tags } = await generateBeliefMapAndTags(coreWish, context);
        const affirmations = await generateAffirmations(coreWish, beliefs);
        
        setState(prev => ({
            ...prev,
            step: 'affirmation-select',
            generatedAffirmations: affirmations,
        }));
    } catch (e) {
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  };

  // 3. VOICE GEN
  const handleVoiceGen = async () => {
    stopAudio();
    setIsLoading(true);
    const fullText = state.generatedAffirmations.map(a => a.text).join(' ... ');
    const buffer = await generateTTS(fullText, state.selectedVoice);
    if (buffer) {
        setState(prev => ({ ...prev, generatedVoiceAudio: buffer }));
        playBuffer(buffer);
    }
    setIsLoading(false);
  };
  
  // 4. MUSIC GEN (PREVIEW)
  const handleMusicGen = async () => {
    stopAudio();
    setIsLoading(true);
    // Reduced preview duration to 10s for speed
    const buffer = await generateSynthesizedMusic(state.selectedMusicStyle, 10); 
    if (buffer) {
        setState(prev => ({ ...prev, generatedMusicAudio: buffer }));
        playBuffer(buffer, true);
    }
    setIsLoading(false);
  };

  // 5. MIXING (OPTIMIZED)
  const handleMixing = async () => {
    stopAudio();
    setIsLoading(true);
    
    // Reduced duration to 60s (1 min) to significantly speed up waiting time
    // This is enough for a loopable track.
    const DURATION = 60; 
    const offlineCtx = new OfflineAudioContext(2, 44100 * DURATION, 44100); 
    
    const musicBuffer = await generateSynthesizedMusic(state.selectedMusicStyle, DURATION);
    const mSource = offlineCtx.createBufferSource();
    mSource.buffer = musicBuffer;
    mSource.loop = true; 
    
    const mGain = offlineCtx.createGain();
    mSource.connect(mGain).connect(offlineCtx.destination);
    
    if (state.generatedVoiceAudio) {
        const vSource = offlineCtx.createBufferSource();
        vSource.buffer = state.generatedVoiceAudio;
        vSource.loop = true; 
        
        const vGain = offlineCtx.createGain();

        // Updated Gain Levels for better balance
        if (state.mixingMode === 'conscious') {
            vGain.gain.value = 0.5; // Reduced from 0.7 for better blend
            mGain.gain.value = 0.3; 
            vSource.connect(vGain); 
            vGain.connect(offlineCtx.destination);
        } else if (state.mixingMode === 'subliminal') {
            vGain.gain.value = 0.015; // Barely audible
            mGain.gain.value = 0.6; 
            const filter = offlineCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 8000; 
            vSource.connect(filter).connect(vGain);
            vGain.connect(offlineCtx.destination);
        } else {
            // Silent/Masked
            vGain.gain.value = 0.01; 
            mGain.gain.value = 0.8; 
            const filter = offlineCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 200; 
            vSource.connect(filter).connect(vGain);
            vGain.connect(offlineCtx.destination);
        }
        vSource.start(0);
    }
    
    mSource.start(0);
    const renderedBuffer = await offlineCtx.startRendering();
    const wavBlob = bufferToWave(renderedBuffer, renderedBuffer.length);
    setState(prev => ({ ...prev, finalSubliminalAudio: wavBlob }));
    playBuffer(renderedBuffer, true);
    setIsLoading(false);
  };

  // 6. FINAL SAVE
  const handleSave = async () => {
     stopAudio(); 
     setIsLoading(true);

     const context = state.messages.map(m => `${m.role}: ${m.text}`).join('\n');
     const coreWish = state.messages[0].text;
     
     const { beliefs, tags } = await generateBeliefMapAndTags(coreWish, context);
     
     const voiceBlob = state.generatedVoiceAudio ? bufferToWave(state.generatedVoiceAudio, state.generatedVoiceAudio.length) : undefined;
     const musicBlob = state.generatedMusicAudio ? bufferToWave(state.generatedMusicAudio, state.generatedMusicAudio.length) : undefined;

     // Smart Naming Logic
     const domain = tags?.domain?.[0] || 'Dream';
     const emotion = tags?.emotional?.[0] || 'Energy';
     // Prioritize Domain > Emotion > Wish keywords
     const customTitle = `LUCID · ${domain} · ${emotion}`;

     const newWish: Wish = {
        id: crypto.randomUUID(),
        content: coreWish,
        createdAt: Date.now(),
        status: 'active',
        tags: tags,
        deepDiveChat: state.messages,
        beliefs: beliefs,
        affirmations: state.generatedAffirmations,
        subliminalAudioBlob: state.finalSubliminalAudio || undefined,
        voiceAudioBlob: voiceBlob,
        musicAudioBlob: musicBlob,
        themeMusicType: state.selectedMusicStyle,
        mixingMode: state.mixingMode,
        audioTitle: customTitle
     };
     
     setTimeout(() => {
         onComplete(newWish);
         setIsLoading(false);
         setState({
             step: 'input', wishInput: '', messages: [], isTyping: false,
             generatedAffirmations: [], 
             generatedVoiceAudio: null, selectedVoice: 'Kore', 
             generatedMusicAudio: null, selectedMusicStyle: '', 
             mixingMode: 'subliminal', finalSubliminalAudio: null
         });
     }, 800);
  };

  return (
    <div className="w-full h-full flex flex-col overflow-hidden font-serif">
      <div className="flex-shrink-0">
        <SectionTitle title="愿望" subtitle={
           state.step === 'input' ? 'INTENT · 播种意图' :
           state.step === 'deep-dive' ? 'DEEP DIVE · 潜意识对话' :
           'ALIGNMENT · 能量校准'
        } />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-4 relative">
        <div className="max-w-4xl mx-auto w-full h-full">
            {/* STEP 1: INPUT */}
            {state.step === 'input' && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-8 animate-fade-in">
                <div className="w-full max-w-lg space-y-6 text-center">
                <h3 className="text-2xl font-serif text-white/90 leading-tight">此刻，<br/>你想显化什么？</h3>
                <textarea
                    className="w-full bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-[2rem] p-4 md:p-6 text-xl text-center focus:ring-1 focus:ring-lucid-glow/30 focus:outline-none transition-all resize-none placeholder-white/20 font-serif leading-relaxed text-lucid-text"
                    rows={2}
                    placeholder="在此写下你的心愿..."
                    value={state.wishInput}
                    onChange={(e) => setState(prev => ({ ...prev, wishInput: e.target.value }))}
                />
                </div>
                <Button onClick={handleStartDeepDive} disabled={!state.wishInput} variant="primary" className="rounded-full px-12 py-4 text-lg shadow-xl shadow-lucid-glow/10">
                开启对话 <Sparkles className="w-5 h-5 ml-2" />
                </Button>
            </div>
            )}

            {/* STEP 2: DEEP DIVE CHAT */}
            {state.step === 'deep-dive' && (
            <div className="flex flex-col h-full bg-white/[0.02] rounded-[2rem] border border-white/5 relative overflow-hidden shadow-inner">
                {/* Chat Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 custom-scrollbar pb-36">
                {state.messages.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`max-w-[90%] md:max-w-[85%] p-4 md:p-5 rounded-2xl text-base font-serif leading-loose tracking-wide shadow-sm ${
                        msg.role === 'user' ? 'bg-lucid-glow/20 text-white rounded-br-sm backdrop-blur-sm border border-lucid-glow/10' : 'bg-white/5 text-lucid-text rounded-bl-sm'
                    }`}>
                        {msg.role === 'model' && <div className="text-xs font-sans text-lucid-accent mb-2 uppercase tracking-widest opacity-80">LUCID</div>}
                        {msg.text}
                    </div>
                    </div>
                ))}
                {state.isTyping && <div className="pl-4"><LoadingSpinner /></div>}
                <div ref={messagesEndRef} />
                </div>
                
                {/* Input Area */}
                <div className="absolute bottom-0 left-0 right-0 p-3 md:p-5 bg-lucid-bg/95 backdrop-blur-2xl border-t border-white/5 z-20">
                
                {/* Suggest Wizard if chat has started */}
                {state.messages.length > 1 && (
                    <div className="flex justify-center mb-3 animate-fade-in">
                        <Button 
                            onClick={handleStartWizard} 
                            disabled={isLoading}
                            variant="glass" 
                            className="rounded-full px-6 py-2 text-sm border-lucid-glow/30 text-lucid-glow hover:bg-lucid-glow/10 min-w-[240px]"
                        >
                        {isLoading ? (
                            <><LoadingSpinner /> <span className="ml-2">正在生成显化蓝图...</span></>
                        ) : (
                            <>✨ 意图已清晰？点击生成显化蓝图</>
                        )}
                        </Button>
                    </div>
                )}

                <div className="flex gap-3 relative items-end">
                    <textarea
                    className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white focus:outline-none focus:bg-white/10 font-serif resize-none h-14 text-base"
                    placeholder="回复以继续挖掘..."
                    value={state.wishInput}
                    onChange={(e) => setState(prev => ({ ...prev, wishInput: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                    />
                    <Button onClick={handleSendMessage} variant="primary" className="h-14 w-14 !p-0 rounded-full" disabled={!state.wishInput.trim()}>
                    <Send className="w-5 h-5" />
                    </Button>
                </div>
                </div>
            </div>
            )}

            {/* WIZARD STEPS ... (Rest of file unchanged) */}
            {state.step === 'affirmation-select' && (
            <div className="flex flex-col gap-4 animate-fade-in pb-32 max-w-2xl mx-auto">
                <div className="text-center mb-6">
                    <h3 className="text-xl font-serif text-white">人生脚本已生成</h3>
                    <p className="text-lucid-dim text-sm mt-2 font-serif tracking-wider">点击下一步，我们将把这些频率植入潜意识。</p>
                </div>
                <div className="grid gap-4">
                    {state.generatedAffirmations.map((aff, i) => (
                        <Card 
                            key={i} 
                            className="border border-white/5 hover:bg-white/5 transition-all bg-white/[0.02] hover:border-lucid-glow/20 p-6"
                        >
                            <span className={`text-[11px] uppercase tracking-widest mb-2 block font-sans ${
                                aff.type === 'conscious' ? 'text-orange-300' : aff.type === 'subconscious' ? 'text-rose-300' : 'text-emerald-300'
                            }`}>
                                {aff.type === 'conscious' ? '显意识 · Mind' : aff.type === 'subconscious' ? '潜意识 · Soul' : '未来自我 · Future'}
                            </span>
                            <p className="text-xl font-serif text-white leading-relaxed">"{aff.text}"</p>
                        </Card>
                    ))}
                </div>
            </div>
            )}

            {state.step === 'voice-gen' && (
                <div className="flex flex-col gap-6 animate-fade-in items-center justify-center min-h-[50vh] pb-32">
                    <div className="text-center">
                    <h3 className="text-xl font-serif text-white">赋能声音</h3>
                    <p className="text-lucid-dim text-sm mt-1 font-serif">选择 AI 导读或亲自录制肯定语</p>
                    </div>
                    
                    <div className="flex bg-white/5 rounded-full p-1.5 border border-white/5">
                        <button 
                            onClick={() => { setVoiceMode('ai'); stopAudio(); setState(prev => ({...prev, generatedVoiceAudio: null}))}}
                            className={`px-8 py-2 rounded-full text-sm font-serif transition-all ${voiceMode === 'ai' ? 'bg-lucid-glow text-lucid-bg' : 'text-lucid-dim'}`}
                        >
                            AI 导读
                        </button>
                        <button 
                            onClick={() => { setVoiceMode('user'); stopAudio(); setState(prev => ({...prev, generatedVoiceAudio: null}))}}
                            className={`px-8 py-2 rounded-full text-sm font-serif transition-all ${voiceMode === 'user' ? 'bg-lucid-glow text-lucid-bg' : 'text-lucid-dim'}`}
                        >
                            亲自录制
                        </button>
                    </div>
                    
                    <div className="w-full max-w-md p-10 bg-white/[0.03] rounded-[2rem] border border-white/5 flex flex-col items-center gap-8 shadow-xl relative overflow-hidden">
                    
                    {voiceMode === 'ai' && (
                        <>
                            <div className="flex gap-2 justify-center mb-2">
                                    {['Kore', 'Fenrir', 'Puck'].map(v => (
                                        <button 
                                        key={v}
                                        onClick={() => setState(prev => ({ ...prev, selectedVoice: v as any }))}
                                        className={`px-4 py-1.5 rounded-full text-xs font-serif transition-all border ${state.selectedVoice === v ? 'bg-white text-black border-white' : 'text-lucid-dim border-transparent hover:border-white/20'}`}
                                        >
                                            {v === 'Kore' ? 'Kore (女)' : v === 'Fenrir' ? 'Fenrir (男)' : 'Puck (中)'}
                                        </button>
                                    ))}
                                </div>
                                
                                {state.generatedVoiceAudio ? (
                                    <div className="flex items-center gap-4 w-full">
                                        <Button onClick={() => playBuffer(state.generatedVoiceAudio!, false)} variant="glass" className="rounded-full !p-4 flex-shrink-0 border-white/20 hover:bg-white/20">
                                            {isPlaying ? <Pause className="w-6 h-6 fill-current"/> : <Play className="w-6 h-6 fill-current ml-1"/>}
                                        </Button>
                                        <div className="flex-1 space-y-2">
                                            <div className="h-1 bg-white/10 w-full rounded-full overflow-hidden">
                                                <div className={`h-full bg-lucid-glow ${isPlaying ? 'animate-[width_3s_linear_infinite]' : 'w-0'}`}></div>
                                            </div>
                                            <div className="text-[11px] text-lucid-dim font-serif uppercase tracking-wider flex justify-between">
                                                <span>Voice Preview</span>
                                                <button onClick={() => setState(prev => ({...prev, generatedVoiceAudio: null}))} className="hover:text-white">重置</button>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <Button onClick={handleVoiceGen} disabled={isLoading} variant="outline" className="w-full py-3 rounded-xl border-white/10 hover:bg-white/5 font-serif text-sm">
                                        {isLoading ? <LoadingSpinner/> : '生成 AI 语音'}
                                    </Button>
                                )}
                        </>
                    )}

                    {voiceMode === 'user' && (
                        <div className="flex flex-col items-center gap-4 w-full">
                            {!state.generatedVoiceAudio && (
                                <div className="w-full bg-white/5 rounded-xl p-4 mb-2 max-h-48 overflow-y-auto custom-scrollbar border border-white/10">
                                    <p className="text-xs text-lucid-dim uppercase tracking-wider mb-2 text-center">请朗读以下内容</p>
                                    <div className="space-y-3 text-center">
                                        {state.generatedAffirmations.map((aff, i) => (
                                            <p key={i} className="text-stone-200 font-serif text-sm leading-relaxed">
                                                "{aff.text}"
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {state.generatedVoiceAudio ? (
                                <div className="flex items-center gap-4 w-full">
                                    <Button onClick={() => playBuffer(state.generatedVoiceAudio!, false)} variant="glass" className="rounded-full !p-4 flex-shrink-0 border-white/20 hover:bg-white/20">
                                        {isPlaying ? <Pause className="w-6 h-6 fill-current"/> : <Play className="w-6 h-6 fill-current ml-1"/>}
                                    </Button>
                                    <div className="flex-1 text-center">
                                        <div className="text-sm text-emerald-400 mb-2">录音已完成</div>
                                        <button onClick={() => setState(prev => ({...prev, generatedVoiceAudio: null}))} className="text-xs text-lucid-dim underline hover:text-white">重新录制</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${isRecording ? 'bg-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.4)] scale-110' : 'bg-white/5'}`}>
                                        <button 
                                            onClick={isRecording ? stopRecording : startRecording}
                                            className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isRecording ? 'bg-red-500 text-white' : 'bg-lucid-glow text-lucid-bg hover:bg-white'}`}
                                        >
                                            {isRecording ? <div className="w-6 h-6 bg-white rounded-sm"></div> : <Mic className="w-7 h-7" />}
                                        </button>
                                    </div>
                                    <p className="text-sm text-lucid-dim">{isRecording ? '正在录制...再次点击结束' : '点击开始朗读'}</p>
                                </>
                            )}
                        </div>
                    )}
                    </div>
                </div>
            )}

            {state.step === 'music-gen' && (
                <div className="flex flex-col gap-6 animate-fade-in pb-32 max-w-3xl mx-auto">
                    <div className="text-center">
                    <h3 className="text-xl font-serif text-white">共振频率</h3>
                    <p className="text-lucid-dim text-sm mt-1 font-serif">选择背景音乐风格</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        {['超柔和 Ambient', '脑波 Binaural', '白噪音 Rain', 'Gameboy 8bit', '女巫梦境 Witch', '水晶疗愈 Crystal'].map(style => (
                            <button
                            key={style}
                            onClick={() => {stopAudio(); setState(prev => ({ ...prev, selectedMusicStyle: style, generatedMusicAudio: null }))}}
                            className={`p-5 rounded-2xl border text-left transition-all duration-300 ${state.selectedMusicStyle === style ? 'bg-lucid-glow/10 border-lucid-glow text-white shadow-[0_0_20px_rgba(253,186,116,0.15)] scale-[1.02]' : 'bg-white/5 border-white/5 text-lucid-dim hover:bg-white/10'}`}
                            >
                                <Music className={`w-5 h-5 mb-2 ${state.selectedMusicStyle === style ? 'text-lucid-glow' : 'opacity-30'}`}/>
                                <span className="text-sm font-serif block tracking-wide">{style}</span>
                            </button>
                        ))}
                    </div>
                    
                    <div className="flex flex-col items-center justify-center p-8 bg-black/10 rounded-[2rem] border border-white/5 space-y-4">
                        {!state.generatedMusicAudio ? (
                            <Button onClick={handleMusicGen} disabled={!state.selectedMusicStyle || isLoading} variant="primary" className="w-full max-w-xs py-3 rounded-full text-sm">
                                {isLoading ? <LoadingSpinner/> : '生成预览 (10秒)'}
                            </Button>
                        ) : (
                            <div className="flex flex-col items-center gap-4 w-full">
                            <div className="text-sm text-lucid-glow flex items-center gap-2 bg-lucid-glow/10 px-4 py-1.5 rounded-full font-serif">
                                <Check className="w-4 h-4"/> 预览已生成
                            </div>
                            <div className="flex gap-3">
                                    <Button onClick={() => playBuffer(state.generatedMusicAudio!, true)} variant="glass" className="rounded-full !p-4">
                                        {isPlaying ? <Pause className="w-5 h-5 fill-current"/> : <Play className="w-5 h-5 fill-current ml-1"/>}
                                    </Button>
                                    <Button onClick={handleMusicGen} variant="outline" className="px-6 rounded-full text-sm">重新生成</Button>
                            </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {state.step === 'subliminal-mix' && (
                <div className="flex flex-col items-center justify-center gap-8 animate-fade-in text-center pb-32">
                    <div className="relative mt-4 group">
                        <div className="absolute inset-0 bg-lucid-glow blur-[50px] opacity-20 animate-pulse-slow"></div>
                        <div className="relative z-10 w-28 h-28 rounded-full border border-white/10 bg-white/5 flex items-center justify-center backdrop-blur-sm">
                            <Layers className="w-12 h-12 text-white/90" />
                        </div>
                    </div>
                    
                    <div>
                        <h3 className="text-2xl font-serif text-white mb-2">最终融合</h3>
                        <p className="text-lucid-dim font-serif text-sm">合成 1 分钟专属潜意识音频 (Loop)</p>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 w-full max-w-md">
                        {[
                            { id: 'conscious', label: '显意识', desc: '人声清晰' },
                            { id: 'subliminal', label: '潜意识', desc: '人声微弱' },
                            { id: 'silent', label: '静音脑波', desc: '人声隐藏' }
                        ].map(mode => (
                            <button
                                key={mode.id}
                                onClick={() => setState(prev => ({ ...prev, mixingMode: mode.id as any }))}
                                className={`p-5 rounded-2xl border transition-all duration-300 ${state.mixingMode === mode.id ? 'bg-white/10 border-lucid-glow text-white scale-105 shadow-lg' : 'bg-transparent border-white/10 text-lucid-dim hover:bg-white/5'}`}
                            >
                                <span className="block font-serif mb-1 text-base">{mode.label}</span>
                                <span className="text-[11px] opacity-60 block tracking-wider font-sans">{mode.desc}</span>
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col w-full max-w-xs gap-3">
                        <Button onClick={handleMixing} disabled={isLoading} variant="glass" className="w-full py-4 text-sm rounded-full">
                            {isLoading ? <LoadingSpinner/> : (state.finalSubliminalAudio ? '重新混合' : '开始混合')}
                        </Button>
                        
                        {state.finalSubliminalAudio && (
                            <Button onClick={() => {
                                if (isPlaying) {
                                    stopAudio(); 
                                } else {
                                    const reader = new FileReader();
                                    reader.onload = (e) => {
                                        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
                                        audioCtx.decodeAudioData(e.target?.result as ArrayBuffer, (buffer) => playBuffer(buffer, true));
                                    };
                                    reader.readAsArrayBuffer(state.finalSubliminalAudio!);
                                }
                            }} variant="outline" className="w-full py-4 border-white/10 hover:border-white/30 rounded-full text-sm">
                                {isPlaying ? <span className="flex items-center gap-2"><Pause className="w-4 h-4"/> 暂停试听</span> : <span className="flex items-center gap-2"><Play className="w-4 h-4"/> 试听结果</span>}
                            </Button>
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* FIXED FOOTER NAVIGATION */}
      {state.step !== 'input' && state.step !== 'deep-dive' && (
          <div className="flex-shrink-0 p-4 border-t border-white/5 bg-lucid-bg/80 backdrop-blur-xl z-50">
             <div className="max-w-4xl mx-auto flex justify-between items-center w-full">
                <Button 
                    onClick={() => {
                    stopAudio();
                    if(state.step === 'affirmation-select') setState(prev => ({...prev, step: 'deep-dive'}));
                    if(state.step === 'voice-gen') setState(prev => ({...prev, step: 'affirmation-select'}));
                    if(state.step === 'music-gen') setState(prev => ({...prev, step: 'voice-gen'}));
                    if(state.step === 'subliminal-mix') setState(prev => ({...prev, step: 'music-gen'}));
                    }} 
                    variant="ghost"
                >
                    返回
                </Button>

                {state.step === 'affirmation-select' && (
                    <Button onClick={() => { stopAudio(); setState(prev => ({ ...prev, step: 'voice-gen' })); }} variant="primary" className="rounded-full px-8">
                        下一步 <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                )}
                {state.step === 'voice-gen' && (
                    <Button disabled={!state.generatedVoiceAudio} onClick={() => { stopAudio(); setState(prev => ({...prev, step: 'music-gen'})); }} variant="primary" className="rounded-full px-8">
                        下一步 <ArrowRight className="w-4 h-4 ml-2"/>
                    </Button>
                )}
                {state.step === 'music-gen' && (
                    <Button disabled={!state.generatedMusicAudio} onClick={() => {stopAudio(); setState(prev => ({...prev, step: 'subliminal-mix'}))}} variant="primary" className="rounded-full px-8">
                        下一步 <ArrowRight className="w-4 h-4 ml-2"/>
                    </Button>
                )}
                {state.step === 'subliminal-mix' && (
                    <Button onClick={handleSave} disabled={!state.finalSubliminalAudio || isLoading} variant="primary" className="rounded-full px-8">
                        {isLoading ? <LoadingSpinner /> : <><Check className="w-4 h-4 mr-2" /> 确认并保存</>}
                    </Button>
                )}
             </div>
          </div>
      )}
    </div>
  );
};

function bufferToWave(abuffer: AudioBuffer, len: number) {
  let numOfChan = abuffer.numberOfChannels,
      length = len * numOfChan * 2 + 44,
      buffer = new ArrayBuffer(length),
      view = new DataView(buffer),
      channels = [], i, sample, offset = 0, pos = 0;

  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"
  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // length = 16
  setUint16(1);                                  // PCM (uncompressed)
  setUint16(numOfChan);
  setUint32(abuffer.sampleRate);
  setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
  setUint16(numOfChan * 2);                      // block-align
  setUint16(16);                                 // 16-bit
  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  for(i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i));

  while(pos < length) {
    for(i = 0; i < numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); 
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; 
      view.setInt16(pos, sample, true);          
      pos += 2;
    }
    offset++
  }

  return new Blob([buffer], {type: "audio/wav"});

  function setUint16(data: any) { view.setUint16(pos, data, true); pos += 2; }
  function setUint32(data: any) { view.setUint32(pos, data, true); pos += 4; }
}

export default IntentView;