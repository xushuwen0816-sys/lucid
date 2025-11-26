import React, { useState } from 'react';
import { Wish, FutureLetter } from '../types';
import { SectionTitle, Card, Button, LoadingSpinner, TabNav } from './Shared';
import { Archive, CheckCircle, Mail, Clock, Send, Star } from 'lucide-react';
import { generateFutureLetterReply } from '../services/geminiService';

interface ArchiveViewProps {
  wishes: Wish[];
}

const ArchiveView: React.FC<ArchiveViewProps> = ({ wishes }) => {
  const [tab, setTab] = useState<'wishes' | 'letters'>('wishes');
  const [letters, setLetters] = useState<FutureLetter[]>([]);
  const [letterInput, setLetterInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSendLetter = async () => {
    if(!letterInput.trim()) return;
    setIsSending(true);
    
    // Simulate AI reply delay for effect
    const reply = await generateFutureLetterReply(letterInput);
    
    const newLetter: FutureLetter = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      content: letterInput,
      sendDate: Date.now() + 10000, // Mock "future" (10s later for demo)
      aiReply: reply,
      isLocked: false // Unlocks immediately for demo
    };

    setLetters([newLetter, ...letters]);
    setLetterInput('');
    setIsSending(false);
  };

  return (
    <div className="w-full h-full flex flex-col">
      <SectionTitle title="我的时空" subtitle="ARCHIVE · 成就与未来" />

      {/* New Sleek Navigation */}
      <TabNav 
        activeTab={tab}
        onTabChange={setTab}
        tabs={[
            { id: 'wishes', icon: Star, label: '显化记录' },
            { id: 'letters', icon: Mail, label: '未来信件' }
        ]}
      />

      <div className="flex-1 overflow-y-auto px-4 custom-scrollbar animate-fade-in">
        <div className="max-w-5xl mx-auto w-full">
            {tab === 'wishes' && (
            wishes.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-stone-500 py-32 space-y-4">
                <div className="p-6 bg-white/5 rounded-full">
                    <Archive className="w-8 h-8 opacity-50" />
                </div>
                <p className="font-serif text-base">暂无显化记录</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
                {wishes.map(wish => (
                    <Card key={wish.id} className="hover:bg-white/10 transition-colors group relative overflow-hidden bg-white/5 border-white/5 p-6">
                    <div className="absolute top-0 right-0 p-4 opacity-50">
                        {wish.tags?.domain?.[0] && <span className="text-xs uppercase bg-black/40 px-3 py-1 rounded border border-white/10">{wish.tags.domain[0]}</span>}
                    </div>
                    <div className="flex justify-between items-start mb-4">
                        <span className={`text-xs px-3 py-1 rounded-full border tracking-widest ${wish.status === 'active' ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10' : 'border-stone-500 text-stone-500'}`}>
                        {wish.status === 'active' ? '进行中' : '已显化'}
                        </span>
                        <span className="text-xs text-stone-500 font-serif">
                        {new Date(wish.createdAt).toLocaleDateString()}
                        </span>
                    </div>
                    <h3 className="text-lg font-serif font-medium mb-2 line-clamp-2 text-stone-200">{wish.content}</h3>
                    <p className="text-xs text-lucid-dim mb-4 line-clamp-1 italic font-serif">
                        新身份: {wish.beliefs.newIdentity}
                    </p>
                    
                    <div className="flex gap-4 text-xs text-stone-500 border-t border-white/5 pt-4">
                        <div className="flex items-center gap-1">
                        <CheckCircle className="w-4 h-4 text-lucid-glow" />
                        {wish.affirmations.length} 条肯定语
                        </div>
                        {wish.visionImage && (
                        <div className="flex items-center gap-1 text-lucid-accent">
                            <Star className="w-4 h-4" />
                            视觉化已激活
                        </div>
                        )}
                    </div>
                    </Card>
                ))}
                </div>
            )
            )}

            {tab === 'letters' && (
            <div className="max-w-2xl mx-auto space-y-8 pb-20">
                {/* Compose */}
                <Card className="border-lucid-glow/20 bg-gradient-to-br from-stone-800/30 to-orange-900/30 p-8">
                <h3 className="font-serif text-lg mb-4 flex items-center gap-2 text-white">
                    <Mail className="w-5 h-5 text-lucid-glow"/> 写给未来的自己
                </h3>
                <div className="relative">
                    <textarea 
                    className="w-full bg-black/20 rounded-xl p-5 text-base font-serif focus:outline-none mb-4 min-h-[140px] text-stone-200 placeholder-stone-600 resize-none border border-white/5 focus:border-lucid-glow/30 transition-colors"
                    placeholder="亲爱的未来自己，希望你已经..."
                    value={letterInput}
                    onChange={(e) => setLetterInput(e.target.value)}
                    />
                </div>
                <div className="flex justify-end">
                    <Button onClick={handleSendLetter} disabled={isSending || !letterInput} className="text-sm px-8">
                    {isSending ? <LoadingSpinner /> : <span className="flex items-center gap-2">发送至量子场 <Send className="w-4 h-4" /></span>}
                    </Button>
                </div>
                </Card>

                {/* List */}
                <div className="space-y-6">
                {letters.map(letter => (
                    <div key={letter.id} className="bg-white/5 rounded-2xl p-8 border border-white/5 hover:border-white/10 transition-colors relative">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-lucid-glow to-transparent opacity-50 rounded-l-2xl"></div>
                    <div className="flex justify-between items-center mb-6">
                        <span className="text-xs text-stone-500 font-serif">{new Date(letter.createdAt).toLocaleDateString()}</span>
                        <span className="text-xs flex items-center gap-1 text-lucid-glow bg-lucid-glow/10 px-3 py-1 rounded-full"><Clock className="w-4 h-4"/> {letter.isLocked ? '封存中' : '已送达'}</span>
                    </div>
                    <p className="text-stone-300 italic mb-8 font-serif leading-loose text-base">"{letter.content}"</p>
                    
                    {letter.aiReply && (
                        <div className="bg-lucid-glow/5 p-6 rounded-xl border border-lucid-glow/10">
                        <span className="text-xs uppercase text-lucid-glow mb-2 block tracking-widest">来自未来的回信</span>
                        <p className="text-white font-serif leading-relaxed text-base">{letter.aiReply}</p>
                        </div>
                    )}
                    </div>
                ))}
                </div>
            </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default ArchiveView;