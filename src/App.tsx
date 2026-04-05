import React, { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pptxgen from "pptxgenjs";
import { 
  Upload, 
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

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;

// Matisse-inspired organic shapes
// ... (rest of the shapes remain the same)
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
  prefix: "text-[#E31E24]", // Matisse Red
  root: "text-[#002FA7]",   // Matisse Blue
  suffix: "text-[#009E60]", // Matisse Green
  base: "text-gray-900",
  syllable: "text-gray-900"
};

const BG_COLORS = [
  "bg-[#FDFBF7]", // Cream
  "bg-[#FFF9E6]", // Pale Yellow
  "bg-[#E6F0FF]", // Pale Blue
  "bg-[#FCE8E8]", // Pale Red
];

export default function App() {
  const [input, setInput] = useState('');
  const [slides, setSlides] = useState<VocabularySlide[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<'edit' | 'present'>('edit');
  const [isParsing, setIsParsing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [userApiKey, setUserApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<string | null>(null);

  const isApiActive = !!userApiKey || !!process.env.GEMINI_API_KEY;

  const saveApiKey = (key: string) => {
    setUserApiKey(key);
    localStorage.setItem('gemini_api_key', key);
  };

  const playAudio = async (text: string, id: string) => {
    if (playingAudio) return;
    
    // If no key is provided and no default key exists, show settings
    if (!userApiKey && !process.env.GEMINI_API_KEY) {
      setShowSettings(true);
      return;
    }

    setPlayingAudio(id);
    try {
      const base64Audio = await generateSpeech(text, userApiKey);
      if (base64Audio) {
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Int16Array(len / 2);
        for (let i = 0; i < len; i += 2) {
          // Assuming 16-bit Little Endian PCM
          bytes[i / 2] = binaryString.charCodeAt(i) | (binaryString.charCodeAt(i + 1) << 8);
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = audioContext.createBuffer(1, bytes.length, 24000);
        const channelData = audioBuffer.getChannelData(0);
        
        for (let i = 0; i < bytes.length; i++) {
          // Convert Int16 to Float32
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
      
      // Matisse-inspired background colors
      const bgColors = ['FDFBF7', 'FFF9E6', 'E6F0FF', 'FCE8E8'];
      const accentColors = ['002FA7', 'E31E24', '009E60', 'FFD700'];
      const currentBg = bgColors[index % bgColors.length];
      const currentAccent = accentColors[index % accentColors.length];
      
      pSlide.background = { fill: currentBg };

      // Add some organic-looking shapes to mimic Matisse style
      pSlide.addShape(pres.ShapeType.ellipse, {
        x: -1, y: -1, w: 4, h: 4,
        fill: { color: currentAccent, transparency: 90 }
      });
      pSlide.addShape(pres.ShapeType.cloud, {
        x: 8, y: 4, w: 3, h: 3,
        fill: { color: accentColors[(index + 1) % 4], transparency: 85 }
      });

      // Word & Syllables
      const wordText = slide.syllables.map(s => s.text).join(' · ');
      pSlide.addText(wordText, {
        x: 0.5, y: 0.4, w: '90%', h: 1.2,
        fontSize: 48, bold: true, color: '002FA7',
        align: 'left', fontFace: 'Arial Black'
      });

      // Definition
      pSlide.addText(slide.definition, {
        x: 0.5, y: 1.6, w: '90%', h: 0.6,
        fontSize: 22, italic: true, color: '555555',
        align: 'left', fontFace: 'Arial'
      });

      // Grid Section
      const gridY = 2.5;
      // Derivatives
      pSlide.addText('DERIVATIVES', { x: 0.5, y: gridY, w: 2.8, h: 0.3, fontSize: 10, bold: true, color: 'E31E24', charSpacing: 2 });
      pSlide.addText(slide.derivatives.join(', '), { x: 0.5, y: gridY + 0.3, w: 2.8, h: 0.6, fontSize: 14, color: '333333', fontFace: 'Arial' });

      // Collocations
      pSlide.addText('COLLOCATIONS', { x: 3.5, y: gridY, w: 2.8, h: 0.3, fontSize: 10, bold: true, color: '002FA7', charSpacing: 2 });
      pSlide.addText(slide.collocations.join(', '), { x: 3.5, y: gridY + 0.3, w: 2.8, h: 0.6, fontSize: 14, color: '333333', fontFace: 'Arial' });

      // Synonyms/Antonyms
      pSlide.addText('SYNONYMS / ANTONYMS', { x: 6.5, y: gridY, w: 3, h: 0.3, fontSize: 10, bold: true, color: '009E60', charSpacing: 2 });
      const synAntText = `${slide.synonyms.slice(0, 2).join(', ')} ≠ ${slide.antonyms.slice(0, 2).join(', ')}`;
      pSlide.addText(synAntText, { x: 6.5, y: gridY + 0.3, w: 3, h: 0.6, fontSize: 14, color: '333333', fontFace: 'Arial' });

      // Example Sentences
      slide.exampleSentences.forEach((s, i) => {
        const cleanText = s.text.replace(/\*/g, '');
        pSlide.addText(`• ${cleanText}`, {
          x: 0.5, y: 4.0 + (i * 0.7), w: '90%', h: 0.6,
          fontSize: 20, color: '1A1A1A',
          align: 'left', fontFace: 'Arial'
        });
      });
    });

    await pres.writeFile({ fileName: `ESL_Vocabulary_Deck.pptx` });
    setIsExporting(null);
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsParsing(true);
    try {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => (item as any).str).join(' ');
          fullText += pageText + '\n';
        }
        setInput(fullText);
      } else {
        const text = await file.text();
        setInput(text);
      }
    } catch (error) {
      console.error('Error parsing file:', error);
      alert('Failed to parse file. Please try copy-pasting the text.');
    } finally {
      setIsParsing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files: File[]) => onDrop(files),
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt']
    },
    multiple: false
  } as any);

  const handleGenerate = async () => {
    if (!input.trim()) return;
    
    // Force settings modal if no API key is provided and no system key exists
    if (!userApiKey && !process.env.GEMINI_API_KEY) {
      setShowSettings(true);
      return;
    }

    setLoading(true);
    try {
      const result = await generateVocabularySlides(input, userApiKey);
      setSlides(result);
      setCurrentSlide(0);
      setViewMode('present');
    } catch (error) {
      console.error(error);
      alert("Error generating slides. Please check your API Key.");
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
      {/* Background Decorations */}
      <OrganicShape color="#002FA7" className="top-[-5%] left-[-5%] w-[400px] h-[400px]" delay={0.2} />
      <LeafShape color="#E31E24" className="bottom-[-10%] right-[-5%] w-[500px] h-[500px]" delay={0.4} />
      <OrganicShape color="#009E60" className="top-[40%] right-[-10%] w-[300px] h-[300px]" delay={0.6} />
      
      <div className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        {/* Settings Button */}
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

        {/* Header */}
        <header className="mb-12 text-center">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#002FA7]/10 text-[#002FA7] font-medium text-sm mb-4"
          >
            <Sparkles size={14} />
            <span>AI-Powered ESL Architect</span>
          </motion.div>
          <motion.h1 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-5xl md:text-7xl font-bold tracking-tight text-gray-900 mb-4"
          >
            Matisse <span className="text-[#E31E24]">Slides</span>
          </motion.h1>
          <motion.p 
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-600 max-w-2xl mx-auto"
          >
            Turn your teaching materials into beautiful, linguistic-focused vocabulary decks.
          </motion.p>
        </header>

        {viewMode === 'edit' ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl shadow-gray-200/50 p-8 border border-gray-100 relative overflow-hidden"
          >
            {/* API Status Indicator */}
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
                  <p className="font-bold mb-1">Getting Started: API Key Required</p>
                  <p className="text-sm opacity-80 leading-relaxed mb-3">
                    To start architecting your ESL slides, you'll need a Gemini API key. It's free and takes 30 seconds to get.
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
                    <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">System Status</span>
                    <span className="text-sm font-bold">Gemini API Active</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-md">READY TO ARCHITECT</span>
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
                  <h2 className="text-2xl font-bold">Input Material</h2>
                </div>
                
                <div {...getRootProps()} className={cn(
                  "px-4 py-2 rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center gap-2 text-sm font-medium",
                  isDragActive ? "border-[#002FA7] bg-[#002FA7]/5 text-[#002FA7]" : "border-gray-200 text-gray-500 hover:border-gray-300"
                )}>
                  <input {...getInputProps()} />
                  {isParsing ? (
                    <RefreshCw className="animate-spin" size={16} />
                  ) : (
                    <Upload size={16} />
                  )}
                  <span>{isParsing ? "Parsing PDF..." : "Upload PDF or TXT"}</span>
                </div>
              </div>
              
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Paste your reading material, vocabulary list, or notes here..."
                className="w-full h-64 p-6 rounded-2xl bg-gray-50 border-2 border-transparent focus:border-[#002FA7] focus:bg-white transition-all outline-none text-lg resize-none"
              />

              <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setInput("The photosynthesis process is essential for plant growth. Chlorophyll absorbs sunlight to convert carbon dioxide and water into glucose. This biological phenomenon sustains life on Earth.")}
                    className="text-xs font-bold text-[#002FA7] hover:underline"
                  >
                    Load Sample Text
                  </button>
                  <span className="text-gray-300">|</span>
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <BookOpen size={16} />
                    <span>Supports articles, lists, and raw text</span>
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
                      Analyzing Material...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Generate Slide Deck
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
                <span className="text-gray-400 font-mono text-sm">
                  {currentSlide + 1} / {slides.length}
                </span>
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

            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={cn(
                  "min-h-[500px] md:aspect-[16/9] w-full rounded-[30px] md:rounded-[40px] shadow-2xl p-6 sm:p-8 md:p-12 lg:p-16 flex flex-col justify-between relative overflow-hidden border-4 md:border-8 border-white print:shadow-none print:border-none print:rounded-none print:w-[297mm] print:h-[210mm] print:m-0",
                  BG_COLORS[currentSlide % BG_COLORS.length]
                )}
                id="active-slide-container"
              >
                {/* Matisse Cutout Decorations */}
                <div className="absolute top-5 right-5 md:top-10 md:right-10 opacity-10 md:opacity-20 rotate-12 print:opacity-10">
                  <LeafShape color="#E31E24" className="w-32 h-32 md:w-64 md:h-64" />
                </div>
                <div className="absolute bottom-[-30px] left-[-30px] md:bottom-[-50px] md:left-[-50px] opacity-5 md:opacity-10">
                  <OrganicShape color="#002FA7" className="w-48 h-48 md:w-96 md:h-96" />
                </div>

                <div className="relative z-10">
                  {/* Word & Syllables */}
                  <div className="mb-4 md:mb-6">
                    <div className="flex flex-wrap items-center gap-x-4 mb-1 md:mb-2">
                      <div className="flex flex-wrap items-baseline gap-x-0.5 md:gap-x-1">
                        {slides[currentSlide].syllables.map((s, i) => (
                          <span 
                            key={i} 
                            className={cn(
                              "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tighter break-words",
                              SYLLABLE_COLORS[s.type]
                            )}
                          >
                            {s.text}
                            {i < slides[currentSlide].syllables.length - 1 && <span className="text-gray-300 mx-0.5 md:mx-1">·</span>}
                          </span>
                        ))}
                      </div>
                      <button
                        onClick={() => playAudio(slides[currentSlide].word, 'word')}
                        disabled={!!playingAudio}
                        className={cn(
                          "p-2 md:p-3 rounded-full transition-all",
                          playingAudio === 'word' ? "bg-[#002FA7] text-white animate-pulse" : "bg-white text-[#002FA7] hover:bg-[#002FA7] hover:text-white border-2 border-[#002FA7]"
                        )}
                      >
                        {playingAudio === 'word' ? <Loader2 className="animate-spin" size={20} /> : <Volume2 size={20} />}
                      </button>
                    </div>
                    <p className="text-base sm:text-lg md:text-xl lg:text-2xl text-gray-600 font-medium italic leading-tight">
                      {slides[currentSlide].definition}
                    </p>
                  </div>

                  {/* Linguistic Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6 mb-6 md:mb-8">
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#E31E24]">Derivatives</h3>
                      <div className="flex flex-wrap gap-1 md:gap-1.5">
                        {slides[currentSlide].derivatives.map((d, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-white/50 border border-gray-200 text-xs md:text-base font-medium">{d}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#002FA7]">Collocations</h3>
                      <div className="flex flex-wrap gap-1 md:gap-1.5">
                        {slides[currentSlide].collocations.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-[#002FA7]/10 text-[#002FA7] text-xs md:text-base font-bold">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2 sm:col-span-2 md:col-span-1">
                      <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#009E60]">Synonyms / Antonyms</h3>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <div className="flex flex-wrap gap-1 md:gap-1.5">
                          {slides[currentSlide].synonyms.slice(0, 2).map((s, i) => (
                            <span key={i} className="text-xs md:text-base font-medium text-gray-700">{s}</span>
                          ))}
                        </div>
                        <span className="text-gray-300 font-bold px-0.5 text-xs md:text-base">≠</span>
                        <div className="flex flex-wrap gap-1 md:gap-1.5">
                          {slides[currentSlide].antonyms.slice(0, 2).map((a, i) => (
                            <span key={i} className="text-xs md:text-base font-medium text-gray-400 bg-gray-100 px-1 rounded italic">{a}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Example Sentences */}
                <div className="relative z-10 space-y-3 md:space-y-4">
                  {slides[currentSlide].exampleSentences.map((s, i) => (
                    <div key={i} className="flex gap-3 md:gap-4 items-start group">
                      <div className={cn(
                        "mt-1.5 md:mt-2 w-2 h-2 md:w-2.5 md:h-2.5 rounded-full flex-shrink-0",
                        i === 0 ? "bg-[#E31E24]" : "bg-[#FFD700]"
                      )} />
                      <div className="flex-1">
                        <p className="text-sm sm:text-base md:text-lg lg:text-xl leading-snug text-gray-800">
                          {formatSentence(s.text)}
                        </p>
                      </div>
                      <button
                        onClick={() => playAudio(s.text.replace(/\*/g, ''), `sentence-${i}`)}
                        disabled={!!playingAudio}
                        className={cn(
                          "p-1.5 md:p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100",
                          playingAudio === `sentence-${i}` ? "bg-[#002FA7] text-white opacity-100" : "bg-white text-[#002FA7] border border-[#002FA7] hover:bg-[#002FA7] hover:text-white"
                        )}
                      >
                        {playingAudio === `sentence-${i}` ? <Loader2 className="animate-spin" size={16} /> : <Volume2 size={16} />}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Controls Bar */}
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
                  const el = document.querySelector('.aspect-\\[16\\/9\\]');
                  if (el) el.requestFullscreen();
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

      {/* Settings Modal */}
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
                    <h3 className="text-xl font-bold">API Settings</h3>
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

      {/* Footer */}
      <footer className="mt-20 pb-10 text-center text-gray-400 text-sm">
        <p>© 2026 Matisse ESL Slide Architect • Inspired by Henri Matisse</p>
      </footer>
    </div>
  );
}
