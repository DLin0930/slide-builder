import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import pptxgen from "pptxgenjs";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Type as TypeIcon, 
  BookOpen, 
  Layers, 
  RefreshCw,
  Download,
  Maximize2,
  FileText,
  X,
  AlertCircle,
  Settings,
  Key,
  Info,
  Volume2,
  Loader2,
  Presentation
} from 'lucide-react';
import { generateVocabularySlides, VocabularySlide, generateSpeech } from './lib/gemini';
import { cn } from './lib/utils';

// Matisse-inspired organic shapes
const OrganicShape = ({ className, color, delay = 0 }: { className?: string; color: string; delay?: number }) => (
  <motion.svg
    viewBox="0 0 200 200"
    className={cn("absolute pointer-events-none z-0", className)}
    initial={{ scale: 0, opacity: 0, rotate: -20 }}
    animate={{ scale: 1, opacity: 0.15, rotate: 0 }}
    transition={{ duration: 1.5, delay, ease: "easeOut" }}
  >
    <path
      fill={color}
      d="M44.7,-76.4C58.3,-69.2,70.1,-58.5,78.5,-45.6C86.9,-32.7,91.9,-17.6,91.2,-2.7C90.5,12.2,84.1,26.9,75.1,39.8C66.1,52.7,54.5,63.8,41.1,71.2C27.7,78.6,12.5,82.3,-2.4,86.5C-17.3,90.7,-32.1,95.4,-45.5,91.1C-58.9,86.8,-70.9,73.5,-79.1,58.8C-87.3,44.1,-91.7,28,-92.8,12.1C-93.9,-3.8,-91.7,-19.5,-84.9,-33.4C-78.1,-47.3,-66.7,-59.4,-53.4,-66.8C-40.1,-74.2,-24.9,-76.9,-9.8,-80.3C5.3,-83.7,20.6,-87.8,44.7,-76.4Z"
      transform="translate(100 100)"
    />
  </motion.svg>
);

const LeafShape = ({ className, color, delay = 0 }: { className?: string; color: string; delay?: number }) => (
  <motion.svg
    viewBox="0 0 200 200"
    className={cn("absolute pointer-events-none z-0", className)}
    initial={{ scale: 0, opacity: 0, rotate: 20 }}
    animate={{ scale: 1, opacity: 0.2, rotate: 0 }}
    transition={{ duration: 1.2, delay, ease: "easeOut" }}
  >
    <path
      fill={color}
      d="M38.1,-65.4C49.4,-58.8,58.7,-48.8,66.1,-37.4C73.5,-26,79,-13,79.5,0.3C80,13.6,75.5,27.2,67.6,38.8C59.7,50.4,48.4,60,35.7,66.4C23,72.8,9,76, -4.5,73.8C-18,71.6,-31,64,-42.8,54.2C-54.6,44.4,-65.2,32.4,-70.8,18.4C-76.4,4.4,-77,-11.6,-71.8,-25.6C-66.6,-39.6,-55.6,-51.6,-43,-57.8C-30.4,-64,-16.2,-64.4,-1.1,-62.5C14,-60.6,26.8,-72,38.1,-65.4Z"
      transform="translate(100 100)"
    />
  </motion.svg>
);

const SYLLABLE_COLORS = {
  prefix: "text-[#E31E24]",
  root: "text-[#002FA7]",
  suffix: "text-[#009E60]"
};

const BG_COLORS = [
  "bg-[#FDFBF7]", // Off-white
  "bg-[#FFF9E6]", // Pale Yellow
  "bg-[#E6F0FF]", // Pale Blue
  "bg-[#FCE8E8]", // Pale Red
];

export default function App() {
  const [input, setInput] = useState('');
  const [slides, setSlides] = useState<VocabularySlide[]>(() => {
    const saved = localStorage.getItem('matisse_slides');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(() => {
    const saved = localStorage.getItem('matisse_current_slide');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [viewMode, setViewMode] = useState<'edit' | 'present'>(() => {
    const saved = localStorage.getItem('matisse_view_mode');
    return (saved as 'edit' | 'present') || 'edit';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  // Only allow user-provided keys to protect author's quota
  const isApiActive = !!userApiKey;

  // Persist slides and state
  useEffect(() => {
    localStorage.setItem('matisse_slides', JSON.stringify(slides));
  }, [slides]);

  useEffect(() => {
    localStorage.setItem('matisse_view_mode', viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem('matisse_current_slide', currentSlide.toString());
  }, [currentSlide]);

  const saveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const playAudio = async (text: string, id: string) => {
    if (playingAudio) return;
    
    // If no key is provided, force setup
    if (!userApiKey) {
      setShowSettings(true);
      return;
    }

    setPlayingAudio(id);
    try {
      const base64Data = await generateSpeech(text, userApiKey);
      if (base64Data) {
        // Convert base64 to ArrayBuffer
        const binaryString = window.atob(base64Data);
        const bytes = new Int16Array(binaryString.length / 2);
        const dataView = new DataView(new Uint8Array(Array.from(binaryString, c => c.charCodeAt(0))).buffer);
        
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = dataView.getInt16(i * 2, true); // Little-endian
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = audioContext.createBuffer(1, bytes.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < bytes.length; i++) {
          channelData[i] = bytes[i] / 32768.0;
        }

        const source = audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContext.destination);
        source.onended = () => {
          setPlayingAudio(null);
          audioContext.close();
        };
        source.start();
      } else {
        setPlayingAudio(null);
      }
    } catch (error) {
      console.error("Audio generation failed", error);
      setPlayingAudio(null);
    }
  };

  const exportToPPTX = async () => {
    if (slides.length === 0) return;
    setIsExporting('pptx');
    
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_16x9';
    pres.title = 'ESL Vocabulary Slide Deck';

    slides.forEach((slide, index) => {
      const pSlide = pres.addSlide();
      const bgColors = ['FDFBF7', 'FFF9E6', 'E6F0FF', 'FCE8E8'];
      pSlide.background = { fill: bgColors[index % bgColors.length] };

      pSlide.addText(slide.word, {
        x: 0.5, y: 0.5, w: 9, h: 1.5,
        fontSize: 64, bold: true, color: '002FA7',
        fontFace: 'Arial Black'
      });

      pSlide.addText(slide.definition, {
        x: 0.5, y: 2, w: 9, h: 1,
        fontSize: 24, italic: true, color: '666666'
      });

      pSlide.addText(`Derivatives: ${slide.derivatives.join(', ')}`, {
        x: 0.5, y: 3.2, w: 4, h: 0.5,
        fontSize: 14, color: 'E31E24', bold: true
      });

      pSlide.addText(`Collocations: ${slide.collocations.join(', ')}`, {
        x: 5, y: 3.2, w: 4, h: 0.5,
        fontSize: 14, color: '002FA7', bold: true
      });

      slide.exampleSentences.slice(0, 2).forEach((s, i) => {
        pSlide.addText(`• ${s.text.replace(/\*/g, '')}`, {
          x: 0.5, y: 4.5 + (i * 1), w: 9, h: 0.8,
          fontSize: 20, color: '333333'
        });
      });
    });

    await pres.writeFile({ fileName: `ESL_Vocabulary_Deck.pptx` });
    setIsExporting(null);
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;
    
    if (!userApiKey) {
      setShowSettings(true);
      return;
    }

    setLoading(true);
    try {
      const result = await generateVocabularySlides(input, userApiKey);
      setSlides(result);
      setCurrentSlide(0);
      setViewMode('present');
    } catch (error: any) {
      console.error(error);
      alert(`Error generating slides: ${error.message || "Unknown error"}. Please check your API Key and ensure it has access to the requested model.`);
    } finally {
      setLoading(false);
    }
  };

  const nextSlide = () => setCurrentSlide((prev) => Math.min(prev + 1, slides.length - 1));
  const prevSlide = () => setCurrentSlide((prev) => Math.max(prev - 1, 0));

  const formatSentence = (text: string) => {
    const parts = text.split(/(\*.*?\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('*') && part.endsWith('*')) {
        return <span key={i} className="font-bold text-[#002FA7] underline decoration-wavy underline-offset-4">{part.slice(1, -1)}</span>;
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] text-gray-900 font-sans selection:bg-[#FFD700] selection:text-gray-900 overflow-x-hidden">
      <OrganicShape color="#002FA7" className="top-[-5%] left-[-5%] w-[400px] h-[400px]" delay={0.2} />
      <LeafShape color="#E31E24" className="bottom-[-10%] right-[-5%] w-[500px] h-[500px]" delay={0.4} />
      <OrganicShape color="#009E60" className="top-[40%] right-[-10%] w-[300px] h-[300px]" delay={0.6} />
      
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="absolute top-6 right-6 z-50">
          <button
            onClick={() => setShowSettings(true)}
            className={cn(
              "p-3 rounded-2xl backdrop-blur-sm border shadow-sm transition-all relative group",
              !isApiActive 
                ? "bg-[#E31E24]/10 border-[#E31E24]/20 text-[#E31E24] animate-pulse" 
                : "bg-white/80 border-gray-200 text-gray-600 hover:text-[#002FA7]"
            )}
          >
            <Settings size={24} className="group-hover:rotate-90 transition-transform duration-500" />
            {!isApiActive && (
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-[#E31E24] rounded-full border-2 border-white" />
            )}
          </button>
        </div>

        <header className="mb-12 text-center">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#002FA7]/10 text-[#002FA7] font-medium text-sm mb-4"
          >
            <Sparkles size={14} />
            <span>AI-Powered ESL Architect</span>
          </motion.div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-gray-900 mb-4">
            Matisse <span className="text-[#E31E24]">ESL</span>
          </h1>
          <p className="text-xl text-gray-500 font-medium">Transform reading materials into artistic vocabulary slides.</p>
        </header>

        {viewMode === 'edit' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl shadow-gray-200/50 p-8 border border-gray-100 relative overflow-hidden"
          >
            {!isApiActive ? (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mb-8 p-5 rounded-2xl bg-[#E31E24]/5 border border-[#E31E24]/20 flex items-start gap-4 text-[#E31E24]"
              >
                <div className="p-2 rounded-xl bg-[#E31E24]/10">
                  <Key size={20} />
                </div>
                <div className="flex-1">
                  <p className="font-bold mb-1">Security Update: Personal API Key Required</p>
                  <p className="text-sm opacity-80 leading-relaxed mb-3">
                    To protect the author's quota and ensure your privacy, this application now requires you to bring your own Gemini API key. It's free and takes 30 seconds to get.
                  </p>
                  <button 
                    onClick={() => setShowSettings(true)}
                    className="text-xs font-bold bg-[#E31E24] text-white px-3 py-1.5 rounded-lg hover:bg-[#E31E24]/90 transition-colors flex items-center gap-2"
                  >
                    <Settings size={14} />
                    Click here to enter your API Key
                  </button>
                </div>
              </motion.div>
            ) : (
              <div className="mb-8 p-4 rounded-2xl bg-green-50 border border-green-100 flex items-center justify-between">
                <div className="flex items-center gap-3 text-green-700">
                  <div className="relative">
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">Status</span>
                    <span className="text-sm font-bold text-green-700">Personal API Key Active</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-md self-end">SECURE MODE</span>
                  {userApiKey && (
                    <span className="text-[9px] text-gray-400 font-mono">
                      Key: {userApiKey.substring(0, 4)}...{userApiKey.substring(userApiKey.length - 4)}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#FFD700] flex items-center justify-center">
                    <FileText className="text-gray-900" size={20} />
                  </div>
                  <h2 className="text-2xl font-bold">請貼入文字內容 (目前僅支援純文字)</h2>
                  {slides.length > 0 && (
                    <button 
                      onClick={() => setViewMode('present')}
                      className="ml-4 px-3 py-1.5 rounded-lg bg-[#002FA7]/10 text-[#002FA7] text-xs font-bold hover:bg-[#002FA7]/20 transition-all"
                    >
                      Resume Last Session
                    </button>
                  )}
                </div>
              </div>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="請在此貼上您的閱讀教材、單字表或筆記... (提醒：Vercel 版本目前僅支援在此貼上純文字內容，請勿直接上傳 PDF 檔案，以免讀取失敗)"
                className="w-full h-64 p-6 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-[#002FA7] focus:bg-white transition-all outline-none text-lg resize-none"
              />

              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInput("The photosynthesis process is essential for plant growth. Chlorophyll absorbs sunlight to convert carbon dioxide and water into glucose. This biological phenomenon sustains life on Earth.")}
                    className="text-xs font-bold text-[#002FA7] hover:underline"
                  >
                    載入範例文字
                  </button>
                  <span className="text-gray-300">|</span>
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <BookOpen size={16} />
                    <span>支援文章、單字清單與純文字內容</span>
                  </div>
                </div>
                
                <button
                  onClick={handleGenerate}
                  disabled={loading || !input.trim()}
                  className={cn(
                    "px-8 py-4 rounded-2xl font-bold text-lg flex items-center gap-3 transition-all transform hover:scale-105 active:scale-95",
                    loading || !input.trim() 
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed" 
                      : "bg-[#002FA7] text-white shadow-lg shadow-[#002FA7]/30 hover:bg-[#002FA7]/90"
                  )}
                >
                  {loading ? (
                    <>
                      <RefreshCw className="animate-spin" size={20} />
                      正在分析教材內容...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      生成單字簡報
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8 print:space-y-0 print:m-0">
            <div className="flex items-center justify-between print:hidden">
              <button 
                onClick={() => setViewMode('edit')}
                className="flex items-center gap-2 text-gray-600 hover:text-[#002FA7] font-medium transition-colors"
              >
                <ChevronLeft size={20} />
                Back to Editor
              </button>
              
              <div className="flex items-center gap-4">
                <div className="hidden md:flex items-center gap-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-gray-50 px-2 py-1 rounded-lg border border-gray-100">
                  <div className="w-1 h-1 rounded-full bg-green-400" />
                  Session Saved
                </div>
                <button 
                  onClick={() => {
                    if (confirm("Are you sure you want to start a new deck? This will clear the current slides.")) {
                      setSlides([]);
                      setViewMode('edit');
                      setCurrentSlide(0);
                      localStorage.removeItem('matisse_slides');
                      localStorage.removeItem('matisse_current_slide');
                      localStorage.removeItem('matisse_view_mode');
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-gray-200 text-gray-600 hover:text-[#E31E24] hover:border-[#E31E24] font-medium transition-all"
                >
                  <RefreshCw size={18} />
                  Start New Deck
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <input 
                      type="number" 
                      min="1" 
                      max={slides.length}
                      value={currentSlide + 1}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1 && val <= slides.length) {
                          setCurrentSlide(val - 1);
                        }
                      }}
                      className="w-12 px-2 py-1 rounded-lg border border-gray-200 text-center font-mono text-sm focus:border-[#002FA7] outline-none"
                    />
                    <span className="text-gray-400 font-mono text-sm">
                      / {slides.length}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={prevSlide}
                      disabled={currentSlide === 0}
                      className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-all"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button 
                      onClick={nextSlide}
                      disabled={currentSlide === slides.length - 1}
                      className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-30 transition-all"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={cn(
                  "min-h-[600px] md:aspect-[16/9] w-full rounded-[30px] md:rounded-[40px] shadow-2xl p-8 sm:p-10 md:p-12 lg:p-16 flex flex-col justify-center relative overflow-hidden border-4 md:border-8 border-white print:shadow-none print:border-none print:rounded-none print:w-[297mm] print:h-[210mm] print:m-0",
                  BG_COLORS[currentSlide % BG_COLORS.length]
                )}
                ref={slideRef}
                id="active-slide-container"
              >
                <div className="absolute top-5 right-5 md:top-10 md:right-10 opacity-10 md:opacity-20 rotate-12 print:opacity-10">
                  <LeafShape color="#E31E24" className="w-32 h-32 md:w-64 md:h-64" />
                </div>
                <div className="absolute bottom-[-30px] left-[-30px] md:bottom-[-50px] md:left-[-50px] opacity-5 md:opacity-10">
                  <OrganicShape color="#002FA7" className="w-48 h-48 md:w-96 md:h-96" />
                </div>

                <div className="relative z-10">
                  <div className="mb-6 md:mb-10">
                    <div className="flex flex-wrap items-center gap-x-6 mb-2 md:mb-4">
                      <div className="flex flex-wrap items-baseline gap-x-1 md:gap-x-2">
                        {slides[currentSlide].syllables.map((s, i) => (
                          <span 
                            key={i} 
                            className={cn(
                              "text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tighter break-words",
                              SYLLABLE_COLORS[s.type]
                            )}
                          >
                            {s.text}
                            {i < slides[currentSlide].syllables.length - 1 && <span className="text-gray-300 mx-1 md:mx-2">·</span>}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => playAudio(slides[currentSlide].word, 'word')}
                        disabled={!!playingAudio}
                        className={cn(
                          "p-3 md:p-4 rounded-full transition-all shadow-lg",
                          playingAudio === 'word' ? "bg-[#002FA7] text-white animate-pulse" : "bg-white text-[#002FA7] hover:bg-[#002FA7] hover:text-white border-2 border-[#002FA7]"
                        )}
                      >
                        {playingAudio === 'word' ? <Loader2 className="animate-spin" size={28} /> : <Volume2 size={28} />}
                      </button>
                    </div>
                    <p className="text-xl sm:text-2xl md:text-2xl lg:text-3xl text-gray-600 font-medium italic leading-tight max-w-4xl">
                      {slides[currentSlide].definition}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-8 mb-8 md:mb-10">
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="text-xs md:text-sm font-bold uppercase tracking-widest text-[#E31E24] opacity-70">Derivatives</h3>
                      <div className="flex flex-wrap gap-2 md:gap-3">
                        {slides[currentSlide].derivatives.slice(0, 2).map((d, i) => (
                          <span key={i} className="px-3 py-1 rounded-full bg-white/60 border border-gray-200 text-sm md:text-lg font-medium shadow-sm">{d}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="text-xs md:text-sm font-bold uppercase tracking-widest text-[#002FA7] opacity-70">Collocations</h3>
                      <div className="flex flex-wrap gap-2 md:gap-3">
                        {slides[currentSlide].collocations.slice(0, 2).map((c, i) => (
                          <span key={i} className="px-3 py-1 rounded-full bg-[#002FA7]/10 text-[#002FA7] text-sm md:text-lg font-bold shadow-sm">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2 sm:col-span-2 md:col-span-1">
                      <h3 className="text-xs md:text-sm font-bold uppercase tracking-widest text-[#009E60] opacity-70">Synonyms / Antonyms</h3>
                      <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex flex-wrap gap-2 md:gap-3">
                          {slides[currentSlide].synonyms.slice(0, 2).map((s, i) => (
                            <span key={i} className="text-sm md:text-lg font-medium text-gray-700">{s}</span>
                          ))}
                        </div>
                        <span className="text-gray-600 font-bold px-1 text-sm md:text-lg">≠</span>
                        <div className="flex flex-wrap gap-2 md:gap-3">
                          {slides[currentSlide].antonyms.slice(0, 2).map((a, i) => (
                            <span key={i} className="text-sm md:text-lg font-medium text-gray-400 bg-gray-100/50 px-2 rounded italic">{a}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative z-10 space-y-5 md:space-y-8">
                  {slides[currentSlide].exampleSentences.slice(0, 2).map((s, i) => (
                    <div key={i} className="flex gap-4 md:gap-6 items-start group">
                      <div className={cn(
                        "mt-2.5 md:mt-3.5 w-3 h-3 md:w-4 md:h-4 rounded-full flex-shrink-0 shadow-sm",
                        i === 0 ? "bg-[#E31E24]" : "bg-[#FFD700]"
                      )} />
                      <div className="flex-1">
                        <p className="text-lg sm:text-xl md:text-xl lg:text-2xl leading-relaxed text-gray-800 font-medium">
                          {formatSentence(s.text)}
                        </p>
                      </div>
                      <button
                        onClick={() => playAudio(s.text.replace(/\*/g, ''), `sentence-${i}`)}
                        disabled={!!playingAudio}
                        className={cn(
                          "p-2 md:p-3 rounded-2xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 shadow-md",
                          playingAudio === `sentence-${i}` ? "bg-[#002FA7] text-white opacity-100" : "bg-white text-[#002FA7] border border-[#002FA7] hover:bg-[#002FA7] hover:text-white"
                        )}
                      >
                        {playingAudio === `sentence-${i}` ? <Loader2 className="animate-spin" size={22} /> : <Volume2 size={22} />}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-wrap gap-4 justify-center print:hidden">
              <button 
                onClick={exportToPPTX}
                disabled={!!isExporting}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 font-bold transition-all disabled:opacity-50"
              >
                {isExporting === 'pptx' ? <RefreshCw className="animate-spin" size={18} /> : <Presentation size={18} />}
                Google Slides (PPTX)
              </button>
              <button 
                onClick={() => {
                  if (slideRef.current) {
                    if (slideRef.current.requestFullscreen) {
                      slideRef.current.requestFullscreen();
                    } else if ((slideRef.current as any).webkitRequestFullscreen) {
                      (slideRef.current as any).webkitRequestFullscreen();
                    } else if ((slideRef.current as any).msRequestFullscreen) {
                      (slideRef.current as any).msRequestFullscreen();
                    }
                  }
                }}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[#002FA7] text-white font-bold shadow-lg shadow-[#002FA7]/20 hover:bg-[#002FA7]/90 transition-all"
              >
                <Maximize2 size={18} />
                Full Screen
              </button>
            </div>
            
            <div className="text-center text-gray-400 text-sm mt-4">
              <p className="flex items-center justify-center gap-1">
                <Info size={14} />
                Note: Audio is only available in the web presentation mode.
              </p>
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
              className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-md bg-white rounded-[32px] shadow-2xl p-8 overflow-hidden"
            >
              <OrganicShape color="#FFD700" className="top-[-20%] right-[-20%] w-64 h-64 opacity-10" />
              
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#002FA7]/10 flex items-center justify-center text-[#002FA7]">
                      <Key size={20} />
                    </div>
                    <h3 className="text-xl font-bold">Security & API Settings</h3>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Gemini API Key</label>
                      {isApiActive ? (
                        <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                          <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                          API Active
                        </span>
                      ) : (
                        <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">Missing Key</span>
                      )}
                    </div>
                    <input
                      type="password"
                      value={userApiKey}
                      onChange={(e) => saveApiKey(e.target.value)}
                      placeholder="Paste your key here..."
                      className="w-full px-4 py-3 rounded-xl bg-gray-50 border-2 border-transparent focus:border-[#002FA7] outline-none transition-all"
                    />
                    <p className="text-xs text-gray-400 leading-relaxed">
                      Your key is stored locally in your browser and never sent to our servers. 
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#002FA7]/5 border border-[#002FA7]/10 flex gap-3">
                    <Info className="text-[#002FA7] flex-shrink-0" size={18} />
                    <div className="text-sm text-gray-600 leading-snug">
                      Don't have a key? Get one for free at <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-[#002FA7] font-bold underline">Google AI Studio</a>.
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSettings(false)}
                    className="w-full py-4 rounded-2xl bg-[#002FA7] text-white font-bold shadow-lg shadow-[#002FA7]/20 hover:bg-[#002FA7]/90 transition-all"
                  >
                    Save & Close
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <footer className="mt-20 pb-10 text-center text-gray-400 text-sm">
        <p>© 2026 Matisse ESL Slide Architect • Inspired by Henri Matisse</p>
      </footer>
    </div>
  );
}
