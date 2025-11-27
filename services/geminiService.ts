import { GoogleGenAI, Type, Modality } from "@google/genai";
import { BeliefMap, Affirmation, TarotCard, WishTags, DailyPractice, JournalEntry, TarotReading, Wish, ChatMessage } from "../types";

// Initialize Gemini Client Lazily
// This prevents the app from crashing at startup if process.env.API_KEY is not immediately available or configured
let aiInstance: GoogleGenAI | null = null;
let dynamicApiKey = typeof localStorage !== 'undefined' ? localStorage.getItem('lucid_api_key') || '' : '';
let userName = typeof localStorage !== 'undefined' ? localStorage.getItem('lucid_user_name') || '旅行者' : '旅行者';

export const setDynamicApiKey = (key: string) => {
  dynamicApiKey = key;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('lucid_api_key', key);
  }
  aiInstance = null; // Reset instance
};

export const setUserName = (name: string) => {
  userName = name || '旅行者';
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('lucid_user_name', userName);
  }
};

export const hasApiKey = () => {
  // Check strict equality to ensure we don't return true for empty strings or undefined
  return !!(process.env.API_KEY || dynamicApiKey);
};

const getAi = () => {
    if (!aiInstance) {
        const key = process.env.API_KEY || dynamicApiKey;
        // We use a fallback empty string to ensure the constructor doesn't throw, 
        // though actual API calls will fail if the key is missing.
        aiInstance = new GoogleGenAI({ apiKey: key || '' });
    }
    return aiInstance;
};

// --- Text & Analysis ---

export const analyzeWishDeepDive = async (wish: string, history: ChatMessage[]): Promise<string> => {
  const model = "gemini-2.5-flash"; 
  
  const systemInstructionText = `
    你是一个名为“LUCID（澄）”的潜意识操作系统向导。
    你的角色：像一位温柔、神秘、充满智慧的灵性疗愈师。
    你的服务对象名字是：${userName}。请在对话中自然、温暖地称呼对方（不要过于频繁，但要让对方感到被看见）。
    
    目标：帮助用户将模糊的愿望转化为清晰的意图，并挖掘深层阻碍。
    用户当前的愿望是：${wish}。
    
    沟通风格：
    1. 语言优美、治愈、但也一针见血。
    2. 请使用中文回复。
    3. 每次回复不要太长，保持对话的流动性。
    4. 每次只问 1 个最核心的问题，引导用户向内看。
    
    核心挖掘方向（不要一次问完，要循序渐进）：
       - 为什么这个愿望对你如此重要？(Why) 实现后的画面是怎样的？(Vision)
       - 你觉得内心有什么声音在阻碍你吗？(Conflict)
       - 如果无法实现，你最害怕的是什么？(Fear)
       - 愿望背后的核心情绪是什么？(Core Emotion)
  `;

  // Construct structured contents from history
  // Workaround for 500 Internal Server Error: Inject system instruction into the first message content
  // instead of using config.systemInstruction which can be unstable on some endpoints/models.
  const contents = history.map((msg, index) => {
    let text = msg.text;
    if (index === 0 && msg.role === 'user') {
      text = `${systemInstructionText}\n\n[User's Initial Input]: ${text}`;
    }
    return {
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: text }]
    };
  });

  try {
    const response = await getAi().models.generateContent({
      model,
      contents,
      // config: { systemInstruction: systemInstructionText } // Removed to fix 500 error
    });
    return response.text || "正在连接你的潜意识频率...";
  } catch (error) {
    console.error("Deep dive error:", error);
    return "信号受到了干扰，请深呼吸，再试一次。";
  }
};

export const generateBeliefMapAndTags = async (wish: string, chatContext: string): Promise<{ beliefs: BeliefMap, tags: WishTags }> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    基于用户(${userName})愿望 "${wish}" 和深挖对话 "${chatContext}"。
    请生成 JSON 格式的信念地图(Belief Map)和愿望标签(Tags)。
    请全部使用中文。

    Requirements:
    1. beliefs: 识别用户的情绪阻碍、限制性信念，并设计一个新的身份(New Identity)。
    2. tags: 
       - emotional: 愿望背后的情绪关键词 (如: 丰盛, 安全感, 自由)
       - domain: 愿望所属领域 (如: 事业, 感情, 灵性)
       - style: 适合这个愿望的视觉/听觉风格 (如: 赛博朋克, 森林, 海洋, 极简)
  `;

  try {
    const response = await getAi().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            beliefs: {
              type: Type.OBJECT,
              properties: {
                emotionalBlocks: { type: Type.ARRAY, items: { type: Type.STRING } },
                limitingBeliefs: { type: Type.ARRAY, items: { type: Type.STRING } },
                newIdentity: { type: Type.STRING },
              },
              required: ["emotionalBlocks", "limitingBeliefs", "newIdentity"]
            },
            tags: {
              type: Type.OBJECT,
              properties: {
                emotional: { type: Type.ARRAY, items: { type: Type.STRING } },
                domain: { type: Type.ARRAY, items: { type: Type.STRING } },
                style: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["emotional", "domain", "style"]
            }
          },
          required: ["beliefs", "tags"],
        },
      },
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Belief/Tag error:", error);
    return {
      beliefs: { emotionalBlocks: ["未知阻碍"], limitingBeliefs: ["未知限制"], newIdentity: "全新的自己" },
      tags: { emotional: ["平静"], domain: ["生活"], style: ["柔和"] }
    };
  }
};

export const generateAffirmations = async (wish: string, beliefs: BeliefMap): Promise<Affirmation[]> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    愿望: "${wish}"
    新身份: "${beliefs.newIdentity}"
    用户: "${userName}"
    
    按照以下风格，请生成 3 条肯定语 (JSON格式)，中文。
    重要：这条肯定语必须风格迥异，不要重复使用相同的词汇（如不要每句都包含"全球"或"自由"）。
    
    1. conscious (显意识): 
       - 风格：理性、逻辑、允许。
       - 句式："我选择..." "我允许自己..." "我意识到..."
       - 作用：安抚头脑的逻辑分析。
       
    2. subconscious (潜意识):
       - 风格：短促、有力、绝对、现在时。
       - 句式："我是..." (I AM)
       - 作用：直接指令，不容置疑。
       
    3. future_self (未来自我):
       - 风格：充满画面感、感恩、扩张、已经实现的喜悦。
       - 句式："我如此感激..." "看着现在的我..."
       - 作用：激活情绪和感受。
  `;

  try {
    const response = await getAi().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["conscious", "subconscious", "future_self"] },
            },
            required: ["text", "type"],
          },
        },
      },
    });
    return JSON.parse(response.text || "[]") as Affirmation[];
  } catch (error) {
    return [
        { text: "我允许自己接纳所有的丰盛。", type: "conscious" },
        { text: "我是丰盛本身。", type: "subconscious" },
        { text: "我如此感激每一天自然流向我的财富。", type: "future_self" }
    ];
  }
};

// --- Vision ---

export const generateVisionImage = async (promptText: string, style: 'realistic' | 'particle' | 'collage' = 'realistic'): Promise<string | null> => {
  const model = "gemini-2.5-flash-image"; 
  
  let stylePrompt = "";
  switch(style) {
    case 'realistic': stylePrompt = "Warm film photography, golden hour, soft cinematic lighting, dreamlike atmosphere, 4k, healing vibes, soft focus."; break;
    case 'particle': stylePrompt = "Abstract 3D particle system, golden spiritual energy flow, glowing points of light, warm void background, mystical."; break;
    case 'collage': stylePrompt = "Aesthetic Pinterest style moodboard collage, mixed media, warm paper texture, ripped edges, artistic composition, soft beige and rose colors."; break;
  }

  const finalPrompt = `${stylePrompt} Subject: ${promptText}. Beautiful, inspiring, high resolution.`;

  try {
    const response = await getAi().models.generateContent({
      model,
      contents: finalPrompt,
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image gen error:", error);
    return null;
  }
};

// --- Audio (TTS & Synthesis) ---

export const generateTTS = async (text: string, voiceName: 'Kore' | 'Fenrir' | 'Puck' = 'Kore'): Promise<AudioBuffer | null> => {
  const model = "gemini-2.5-flash-preview-tts";
  try {
    const response = await getAi().models.generateContent({
      model,
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    const audioBuffer = await decodeAudioData(decode(base64Audio), audioContext, 24000, 1);
    return audioBuffer;

  } catch (error) {
    console.error("TTS error:", error);
    return null;
  }
};

// High Quality Web Audio Synthesis (Engine 3.0)
export const generateSynthesizedMusic = async (style: string, durationSeconds: number = 180): Promise<AudioBuffer> => {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 44100 });
  const offlineCtx = new OfflineAudioContext(2, ctx.sampleRate * durationSeconds, ctx.sampleRate);
  
  // 1. Reverb Impulse Response (Atmosphere)
  const createReverbBuffer = () => {
      const len = ctx.sampleRate * 3; // 3s tail
      const decay = 2.0;
      const buffer = offlineCtx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
          const chData = buffer.getChannelData(c);
          for (let i = 0; i < len; i++) {
              chData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
          }
      }
      return buffer;
  };
  
  const reverb = offlineCtx.createConvolver();
  reverb.buffer = createReverbBuffer();
  reverb.connect(offlineCtx.destination);
  
  // 2. Master Bus with LFO for "Breathing" dynamics
  const master = offlineCtx.createGain();
  master.gain.value = 0.5; // Base volume
  master.connect(offlineCtx.destination);
  master.connect(reverb); // Send to reverb

  // LFO for breathing effect (Modulates volume slowly)
  const lfo = offlineCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.05; // Very slow cycle (20s)
  const lfoGain = offlineCtx.createGain();
  lfoGain.gain.value = 0.1; // Depth of breathing
  lfo.connect(lfoGain);
  lfoGain.connect(master.gain);
  lfo.start();

  // Synthesis Algorithms
  if (style.includes('女巫') || style.includes('Witch')) {
      // Dark, Detuned Sawtooth Drone + Low Rumble
      const freqs = [55, 110, 164.81]; // A1, A2, E3
      freqs.forEach((f, i) => {
          const osc = offlineCtx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.value = f;
          
          // Slight detune for thickness
          osc.detune.value = Math.random() * 10 - 5;

          const filter = offlineCtx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 300; // Dark tone

          const gain = offlineCtx.createGain();
          gain.gain.value = 0.15;
          
          osc.connect(filter).connect(gain).connect(master);
          osc.start();
      });
  } else if (style.includes('水晶') || style.includes('Crystal')) {
      // Pure Sine Waves + Bell-like FM
      const freqs = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
      freqs.forEach((f, i) => {
          const osc = offlineCtx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          
          const pan = offlineCtx.createStereoPanner();
          pan.pan.value = (i % 2 === 0 ? -1 : 1) * 0.5;
          
          const gain = offlineCtx.createGain();
          gain.gain.value = 0.04;
          
          osc.connect(pan).connect(gain).connect(master);
          osc.start();
          
          // Add a "sparkle" layer
          if(Math.random() > 0.5) {
             const sparkle = offlineCtx.createOscillator();
             sparkle.type = 'sine';
             sparkle.frequency.value = f * 2;
             const sGain = offlineCtx.createGain();
             sGain.gain.value = 0;
             sGain.gain.setValueAtTime(0.02, 0);
             sGain.gain.exponentialRampToValueAtTime(0.001, durationSeconds); // Long decay
             sparkle.connect(sGain).connect(master);
             sparkle.start();
          }
      });
  } else if (style.includes('Ambient') || style.includes('柔和')) {
      // Warm Triangle Pad - Classic Ambient
      [110, 130.81, 164.81, 196.00, 220].forEach((f, i) => {
          const osc = offlineCtx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = f;
          
          // Slow pan movement
          const pan = offlineCtx.createStereoPanner();
          const panLfo = offlineCtx.createOscillator();
          panLfo.frequency.value = 0.1 + Math.random() * 0.1;
          panLfo.connect(pan.pan);
          panLfo.start();
          
          const filter = offlineCtx.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 600;

          const gain = offlineCtx.createGain();
          gain.gain.value = 0.08;
          
          osc.connect(filter).connect(pan).connect(gain).connect(master);
          osc.start();
      });
  } else if (style.includes('Binaural') || style.includes('脑波')) {
      // Pure Theta (4Hz difference) - REDUCED VOLUME
      const base = 200;
      const oscL = offlineCtx.createOscillator();
      oscL.type = 'sine';
      oscL.frequency.value = base;
      const panL = offlineCtx.createStereoPanner();
      panL.pan.value = -1;
      
      const oscR = offlineCtx.createOscillator();
      oscR.type = 'sine';
      oscR.frequency.value = base + 4; // 4Hz Theta beat
      const panR = offlineCtx.createStereoPanner();
      panR.pan.value = 1;
      
      const binauralGain = offlineCtx.createGain();
      binauralGain.gain.value = 0.15; // Much quieter than before

      // Pink Noise Background
      const bSize = ctx.sampleRate * durationSeconds;
      const noiseBuffer = offlineCtx.createBuffer(1, bSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for(let i=0; i<bSize; i++) output[i] = (Math.random() * 2 - 1) * 0.02; // Very quiet noise
      const noiseNode = offlineCtx.createBufferSource();
      noiseNode.buffer = noiseBuffer;
      const noiseFilter = offlineCtx.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 400;
      
      noiseNode.connect(noiseFilter).connect(master);
      noiseNode.start();

      oscL.connect(panL).connect(binauralGain).connect(master);
      oscR.connect(panR).connect(binauralGain).connect(master);
      oscL.start();
      oscR.start();
  } else if (style.includes('8bit') || style.includes('Gameboy')) {
     const notes = [220, 261.63, 329.63, 392];
     const speed = 0.4; // SLOWER speed (was 0.15)
     
     const osc = offlineCtx.createOscillator();
     osc.type = 'square';
     
     // Frequency automation
     osc.frequency.setValueAtTime(notes[0], 0);
     for(let t=0; t < durationSeconds; t+=speed) {
         const n = notes[Math.floor(Math.random() * notes.length)];
         osc.frequency.setValueAtTime(n, t);
     }
     
     const gain = offlineCtx.createGain();
     gain.gain.value = 0.03; // Quiet
     osc.connect(gain).connect(master);
     osc.start();
  } else {
     // Default Rain/White Noise
     const bSize = ctx.sampleRate * durationSeconds;
     const noiseBuffer = offlineCtx.createBuffer(1, bSize, ctx.sampleRate);
     const output = noiseBuffer.getChannelData(0);
     for(let i=0; i<bSize; i++) output[i] = (Math.random() * 2 - 1) * 0.05;
     const noiseNode = offlineCtx.createBufferSource();
     noiseNode.buffer = noiseBuffer;
     const filter = offlineCtx.createBiquadFilter();
     filter.type = 'lowpass';
     filter.frequency.value = 800;
     noiseNode.connect(filter).connect(master);
     noiseNode.start();
  }

  return await offlineCtx.startRendering();
};

// --- Ritual ---

export const generateTarotReading = async (
    drawnCards: { name: string, isReversed: boolean, position: 'body' | 'mind' | 'spirit' }[],
    wishes: Wish[]
): Promise<TarotReading> => {
  const model = "gemini-2.5-flash";
  const wishSummary = wishes.map(w => w.content).join(", ") || "无特定愿望";
  
  const cardsDesc = drawnCards.map(c => `${c.position}: ${c.name} (${c.isReversed ? '逆位' : '正位'})`).join('\n');

  const prompt = `
    用户(${userName})刚刚抽取了以下三张塔罗牌：
    ${cardsDesc}
    
    用户的愿望列表：${wishSummary}。

    请根据这三张牌（注意正逆位含义）进行解读，分别对应身(Body)、心(Mind)、灵(Spirit)。
    并根据牌面能量，给出今日的行动指引。
    
    请用中文返回结果(JSON):
    1. cards: 包含 name(牌名), isReversed(是否逆位), meaning(详细解读，约80字，深入分析牌面含义和对用户当下的启示), position ("body", "mind", "spirit"), imagePrompt (一张描绘牌面意象的英文提示词).
    2. guidance: 总体灵性指引 (General Guidance).
    3. actionHint: 今日具体的行动提示 (Action Hint).
    4. focusWishName: 在用户的愿望中，选出今天最值得推进的一个 (Focus Wish)，如无则填 "当下"。
  `;
  try {
    const response = await getAi().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            cards: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  isReversed: { type: Type.BOOLEAN },
                  meaning: { type: Type.STRING },
                  position: { type: Type.STRING, enum: ["body", "mind", "spirit"] },
                  imagePrompt: { type: Type.STRING },
                },
                required: ["name", "isReversed", "meaning", "position", "imagePrompt"]
              }
            },
            guidance: { type: Type.STRING },
            actionHint: { type: Type.STRING },
            focusWishName: { type: Type.STRING },
          },
          required: ["cards", "guidance", "actionHint", "focusWishName"]
        },
      },
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Tarot error:", error);
    return {
        cards: drawnCards.map(c => ({ ...c, meaning: "能量读取中...", imagePrompt: "Abstract mystic energy" })),
        guidance: "相信直觉，答案在心中。",
        actionHint: "静心冥想 5 分钟。",
        focusWishName: "内在平静"
    };
  }
};

export const generateDailyPractice = async (readingContext: string): Promise<DailyPractice> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    基于以下塔罗解读和能量状态 (User: ${userName})：
    "${readingContext}"
    
    请生成今日的修行练习(JSON):
    1. energyStatus: 用一个词或短语形容今日能量场 (如: 蓄势待发, 内在整合).
    2. todaysAffirmation: 一句简短有力的肯定语.
    3. actionStep: 一个具体可执行的微行动 (Micro-Action).
  `;

  try {
    const response = await getAi().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                energyStatus: { type: Type.STRING },
                todaysAffirmation: { type: Type.STRING },
                actionStep: { type: Type.STRING },
            },
            required: ["energyStatus", "todaysAffirmation", "actionStep"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    return { energyStatus: "平静", todaysAffirmation: "我与当下同在。", actionStep: "深呼吸三次。" };
  }
};

export const analyzeJournalEntry = async (text: string): Promise<JournalEntry['aiAnalysis']> => {
  const model = "gemini-2.5-flash";
  const prompt = `
    分析以下用户(${userName})的觉察日记：
    "${text}"

    请返回 JSON:
    1. blocksIdentified: 识别出的限制性信念或思维模式 (Array of strings).
    2. emotionalState: 用户当下的情绪状态关键词 (Array of strings, e.g. ["焦虑", "期待"]).
    3. summary: 一段富有洞察力的心理分析和反馈 (Deep Insight)，不要过于简短，如果用户情绪低落/激动，应该更注重共情.
    4. tomorrowsAdvice: 给明天的建议.
    5. highSelfTraits: 从日记中发现的用户的高我特质/优点 (Array of strings, e.g. ["诚实", "勇敢"]).
  `;

  try {
    const response = await getAi().models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            blocksIdentified: { type: Type.ARRAY, items: { type: Type.STRING } },
            emotionalState: { type: Type.ARRAY, items: { type: Type.STRING } },
            summary: { type: Type.STRING },
            tomorrowsAdvice: { type: Type.STRING },
            highSelfTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["blocksIdentified", "emotionalState", "summary", "tomorrowsAdvice", "highSelfTraits"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error(error);
    return undefined;
  }
};

// --- Archive / Reporting ---

export const generateWeeklyReport = async (entries: JournalEntry[]): Promise<string> => {
    const model = "gemini-2.5-flash";
    const entriesText = entries.map(e => `[${new Date(e.date).toLocaleDateString()}] ${e.content}`).join('\n');
    
    const prompt = `
      基于以下过去一周的觉察日记 (User: ${userName})：
      ${entriesText}

      请生成一份 "LUCID 能量周报" (Markdown格式)，并直接返回报告，不要提及“好的，这是基于你日记生成的分析”等语句，直接与用户对话。
      
      结构要求：
      1. **本周能量关键词** (Heading 2)
      2. **核心突破** (Heading 2): 识别出的主要模式和已转化的信念。
      3. **情绪流动图谱** (Heading 2): 情绪的变化趋势分析。
      4. **高我特质闪光点** (Heading 2): 肯定用户的成长。
      5. **下周指引** (Heading 2): 灵性建议，可以是心态调整，也可以是具体可操作的一件事，或者二者兼有。

      风格：温暖、深度、充满力量。不要频繁引用用户的原话，用自己的话转述，让用户感觉被看见，被关心。
    `;

    try {
        const response = await getAi().models.generateContent({
            model,
            contents: prompt,
        });
        return response.text || "能量整合中...";
    } catch (error) {
        return "无法生成报告。";
    }
};

export const generateFutureLetterReply = async (userLetter: string): Promise<string> => {
    const model = "gemini-2.5-flash";
    const prompt = `
      User (${userName}) send a letter to their future self:
      "${userLetter}"

      You are the "Higher Self" or "Future Self" of ${userName}.
      Please write a reply.
      
      Guidelines:
      1. Tone: Deeply empathetic, wise, unconditional love, comforting, and empowering.
      2. If the user seems distressed, anxious, or self-critical, prioritize emotional validation and comfort. Tell them it's okay, and that this too shall pass.
      3. If the user is happy, celebrate with them.
      4. Length: meaningful and substantial (approx 150-200 words). Do not be too brief.
      5. Language: Chinese.
      6. Context: You are speaking from a timeline where everything has already worked out.
    `;

    try {
        const response = await getAi().models.generateContent({
            model,
            contents: prompt,
        });
        return response.text || "收到。我在未来等你。";
    } catch (error) {
        return "信号连接中...";
    }
};

// Helpers for Audio Decoding
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}