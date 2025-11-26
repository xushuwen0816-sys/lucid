
export enum AppView {
  INTENT = 'INTENT',
  TOOLS = 'TOOLS',
  RITUAL = 'RITUAL',
  ARCHIVE = 'ARCHIVE',
}

// Updated State for the new Intent Wizard Workflow
export interface IntentState {
  step: 'input' | 'deep-dive' | 'affirmation-select' | 'voice-gen' | 'music-gen' | 'subliminal-mix';
  wishInput: string;
  messages: ChatMessage[];
  isTyping: boolean;
  
  // Wizard Data
  generatedAffirmations: Affirmation[];
  // selectedAffirmation: string; // REMOVED: Now we use all affirmations
  
  generatedVoiceAudio: AudioBuffer | null;
  selectedVoice: 'Kore' | 'Fenrir' | 'Puck';
  
  generatedMusicAudio: AudioBuffer | null;
  selectedMusicStyle: string;
  
  // Mixing
  mixingMode: 'conscious' | 'subliminal' | 'silent';
  finalSubliminalAudio: Blob | null; // The mixed result
}

export interface Wish {
  id: string;
  content: string;
  createdAt: number;
  tags: WishTags;
  status: 'draft' | 'active' | 'manifested';
  
  deepDiveChat: ChatMessage[];
  beliefs: BeliefMap;
  affirmations: Affirmation[];
  
  // Generated Assets
  visionImage?: string;
  voiceAudioBlob?: Blob; // Stored as blob for playback
  musicAudioBlob?: Blob;
  subliminalAudioBlob?: Blob;
  audioTitle?: string; // New field for custom audio name
  
  themeMusicType?: string;
  mixingMode?: 'conscious' | 'subliminal' | 'silent';
}

export interface WishTags {
  emotional: string[];
  domain: string[];
  style: string[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export interface BeliefMap {
  emotionalBlocks: string[];
  limitingBeliefs: string[];
  newIdentity: string;
}

export interface Affirmation {
  text: string;
  type: 'conscious' | 'subconscious' | 'future_self';
  isFavorite?: boolean;
}

export interface TarotCard {
  name: string;
  isReversed: boolean;
  meaning: string;
  position: 'body' | 'mind' | 'spirit';
  imagePrompt: string; 
  imageUrl?: string;
}

export interface TarotReading {
  cards: TarotCard[];
  guidance: string;
  actionHint: string;
  focusWishName?: string;
}

export interface DailyPractice {
  energyStatus: string;
  todaysAffirmation: string;
  actionStep: string;
}

export interface JournalEntry {
  id: string;
  date: number;
  content: string;
  aiAnalysis?: {
    blocksIdentified: string[];
    emotionalState: string;
    summary: string;
    tomorrowsAdvice: string;
  };
}

export interface FutureLetter {
  id: string;
  createdAt: number;
  content: string;
  sendDate: number;
  aiReply?: string;
  isLocked: boolean;
}