import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import * as pdfjsLib from 'pdfjs-dist';
import pptxgen from "pptxgenjs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
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
  Presentation,
  FileDown
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
      
      // Background color (Matisse inspired)
      const bgColors = ['FDFBF7', 'FFF9E6', 'E6F0FF', 'FCE8E8'];
      pSlide.background = { fill: bgColors[index % bgColors.length] };

      // Word & Syllables
      const wordText = slide.syllables.map(s => s.text).join(' · ');
      pSlide.addText(wordText, {
        x: 0.5, y: 0.5, w: '90%', h: 1.5,
        fontSize: 44, bold: true, color: '002FA7',
        align: 'left', fontFace: 'Arial'
      });

      // Definition
      pSlide.addText(slide.definition, {
        x: 0.5, y: 1.8, w: '90%', h: 0.8,
        fontSize: 24, italic: true, color: '666666',
        align: 'left'
      });

      // Grid Section
      // Derivatives
      pSlide.addText('DERIVATIVES', { x: 0.5, y: 2.8, w: 2.5, h: 0.3, fontSize: 10, bold: true, color: 'E31E24' });
      pSlide.addText(slide.derivatives.join(', '), { x: 0.5, y: 3.1, w: 2.5, h: 0.5, fontSize: 14, color: '333333' });

      // Collocations
      pSlide.addText('COLLOCATIONS', { x: 3.5, y: 2.8, w: 2.5, h: 0.3, fontSize: 10, bold: true, color: '002FA7' });
      pSlide.addText(slide.collocations.join(', '), { x: 3.5, y: 3.1, w: 2.5, h: 0.5, fontSize: 14, color: '333333' });

      // Synonyms/Antonyms
      pSlide.addText('SYNONYMS / ANTONYMS', { x: 6.5, y: 2.8, w: 3, h: 0.3, fontSize: 10, bold: true, color: '009E60' });
      const synAntText = `${slide.synonyms.slice(0, 2).join(', ')} | ${slide.antonyms.slice(0, 2).join(', ')}`;
      pSlide.addText(synAntText, { x: 6.5, y: 3.1, w: 3, h: 0.5, fontSize: 14, color: '333333' });

      // Example Sentences
      slide.exampleSentences.forEach((s, i) => {
        pSlide.addText(`• ${s.text.replace(/\*/g, '')}`, {
          x: 0.5, y: 4.2 + (i * 0.8), w: '90%', h: 0.6,
          fontSize: 20, color: '333333',
          align: 'left'
        });
      });
    });

    await pres.writeFile({ fileName: `ESL_Vocabulary_Deck.pptx` });
    setIsExporting(null);
  };

  const exportToPDF = async () => {
    if (slides.length === 0) return;
    setIsExporting('pdf');
    
    const pdf = new jsPDF('l', 'mm', 'a4');
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();

    // We need to render each slide one by one
    // To do this efficiently, we'll use a temporary hidden container
    const tempDiv = document.createElement('div');
    tempDiv.style.position = 'fixed';
    tempDiv.style.top = '-9999px';
    tempDiv.style.left = '-9999px';
    tempDiv.style.width = '1280px'; // 16:9 aspect ratio
    tempDiv.style.height = '720px';
    document.body.appendChild(tempDiv);

    for (let i = 0; i < slides.length; i++) {
      // Create a temporary React root to render the slide
      // For simplicity, we can just use the existing slide DOM if we can isolate it
      // But a better way is to move the current slide index and capture it
      setCurrentSlide(i);
      // Wait for React to re-render
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const slideElement = document.querySelector('.aspect-\\[16\\/9\\]') as HTMLElement;
      if (slideElement) {
        const canvas = await html2canvas(slideElement, {
          scale: 2,
          useCORS: true,
          backgroundColor: null
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, 0, width, height);
      }
    }

    pdf.save('ESL_Vocabulary_Deck.pdf');
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
    
    // If no key is provided and no default key exists, show settings
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
            className="p-3 rounded-2xl bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm hover:shadow-md transition-all text-gray-600 hover:text-[#002FA7]"
          >
            <Settings size={24} />
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
                  "min-h-[500px] md:aspect-[16/9] w-full rounded-[30px] md:rounded-[40px] shadow-2xl p-6 sm:p-10 md:p-16 lg:p-20 flex flex-col justify-between relative overflow-hidden border-4 md:border-8 border-white print:shadow-none print:border-none print:rounded-none print:w-[297mm] print:h-[210mm] print:m-0",
                  BG_COLORS[currentSlide % BG_COLORS.length]
                )}
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
                  <div className="mb-6 md:mb-8">
                    <div className="flex flex-wrap items-center gap-x-4 mb-1 md:mb-2">
                      <div className="flex flex-wrap items-baseline gap-x-0.5 md:gap-x-1">
                        {slides[currentSlide].syllables.map((s, i) => (
                          <span 
                            key={i} 
                            className={cn(
                              "text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-black tracking-tighter break-words",
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
                          "p-3 rounded-full transition-all",
                          playingAudio === 'word' ? "bg-[#002FA7] text-white animate-pulse" : "bg-white text-[#002FA7] hover:bg-[#002FA7] hover:text-white border-2 border-[#002FA7]"
                        )}
                      >
                        {playingAudio === 'word' ? <Loader2 className="animate-spin" size={24} /> : <Volume2 size={24} />}
                      </button>
                    </div>
                    <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl text-gray-600 font-medium italic leading-tight">
                      {slides[currentSlide].definition}
                    </p>
                  </div>

                  {/* Linguistic Info Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 md:gap-8 mb-8 md:mb-12">
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#E31E24]">Derivatives</h3>
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {slides[currentSlide].derivatives.map((d, i) => (
                          <span key={i} className="px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-white/50 border border-gray-200 text-sm md:text-lg font-medium">{d}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2">
                      <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#002FA7]">Collocations</h3>
                      <div className="flex flex-wrap gap-1.5 md:gap-2">
                        {slides[currentSlide].collocations.map((c, i) => (
                          <span key={i} className="px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-[#002FA7]/10 text-[#002FA7] text-sm md:text-lg font-bold">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1 md:space-y-2 sm:col-span-2 md:col-span-1">
                      <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#009E60]">Synonyms / Antonyms</h3>
                      <div className="flex flex-wrap gap-2 items-center">
                        <div className="flex flex-wrap gap-1.5 md:gap-2">
                          {slides[currentSlide].synonyms.slice(0, 2).map((s, i) => (
                            <span key={i} className="text-sm md:text-lg font-medium text-gray-700">{s}</span>
                          ))}
                        </div>
                        <span className="text-gray-300 font-bold px-0.5 md:px-1 text-sm md:text-lg">≠</span>
                        <div className="flex flex-wrap gap-1.5 md:gap-2">
                          {slides[currentSlide].antonyms.slice(0, 2).map((a, i) => (
                            <span key={i} className="text-sm md:text-lg font-medium text-gray-400 bg-gray-100 px-1.5 md:px-2 rounded italic">{a}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Example Sentences */}
                <div className="relative z-10 space-y-4 md:space-y-6">
                  {slides[currentSlide].exampleSentences.map((s, i) => (
                    <div key={i} className="flex gap-3 md:gap-4 items-start group">
                      <div className={cn(
                        "mt-1.5 md:mt-2 w-2 h-2 md:w-3 md:h-3 rounded-full flex-shrink-0",
                        i === 0 ? "bg-[#E31E24]" : "bg-[#FFD700]"
                      )} />
                      <div className="flex-1">
                        <p className="text-lg sm:text-xl md:text-2xl lg:text-3xl leading-snug text-gray-800">
                          {formatSentence(s.text)}
                        </p>
                      </div>
                      <button
                        onClick={() => playAudio(s.text.replace(/\*/g, ''), `sentence-${i}`)}
                        disabled={!!playingAudio}
                        className={cn(
                          "p-2 rounded-xl transition-all opacity-0 group-hover:opacity-100 focus:opacity-100",
                          playingAudio === `sentence-${i}` ? "bg-[#002FA7] text-white opacity-100" : "bg-white text-[#002FA7] border border-[#002FA7] hover:bg-[#002FA7] hover:text-white"
                        )}
                      >
                        {playingAudio === `sentence-${i}` ? <Loader2 className="animate-spin" size={18} /> : <Volume2 size={18} />}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Controls Bar */}
            <div className="flex flex-wrap gap-4 justify-center print:hidden">
              <button 
                onClick={exportToPDF}
                disabled={!!isExporting}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-gray-200 hover:bg-gray-50 font-bold transition-all disabled:opacity-50"
              >
                {isExporting === 'pdf' ? <RefreshCw className="animate-spin" size={18} /> : <FileDown size={18} />}
                Export All PDF
              </button>
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
                    <label className="text-sm font-bold text-gray-500 uppercase tracking-wider">Gemini API Key</label>
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
