import { GoogleGenAI, Type, Modality } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface VocabularySlide {
  word: string;
  syllables: { text: string; type: "prefix" | "root" | "suffix" | "base" | "syllable" }[];
  definition: string;
  derivatives: string[];
  collocations: string[];
  synonyms: string[];
  antonyms: string[];
  exampleSentences: {
    text: string;
    hasCollocation: boolean;
  }[];
}

export async function generateVocabularySlides(text: string, userApiKey?: string): Promise<VocabularySlide[]> {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY || "";
  const genAi = new GoogleGenAI({ apiKey });
  
  const response = await genAi.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Extract ALL significant vocabulary words and academic phrases from the following text for ESL learners. Do not skip any important terms. For each word/phrase, provide a detailed linguistic breakdown and teaching materials. 
    
    Text: ${text}
    
    Requirements for each slide:
    1. Syllable breakdown with identification of prefix, root, and suffix where applicable.
    2. Derivatives (other forms of the word).
    3. 2-3 common collocations.
    4. Synonyms and antonyms.
    5. Two example sentences DIFFERENT from the input text. One MUST use one of the collocations.
    6. Mark the target word and collocations in the sentences using asterisks (e.g., *word*).
    
    IMPORTANT: Be exhaustive. If the text has 20 important words, provide 20 objects in the array.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            syllables: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ["prefix", "root", "suffix", "base", "syllable"] }
                },
                required: ["text", "type"]
              }
            },
            definition: { type: Type.STRING },
            derivatives: { type: Type.ARRAY, items: { type: Type.STRING } },
            collocations: { type: Type.ARRAY, items: { type: Type.STRING } },
            synonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            antonyms: { type: Type.ARRAY, items: { type: Type.STRING } },
            exampleSentences: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { type: Type.STRING },
                  hasCollocation: { type: Type.BOOLEAN }
                },
                required: ["text", "hasCollocation"]
              }
            }
          },
          required: ["word", "syllables", "definition", "derivatives", "collocations", "synonyms", "antonyms", "exampleSentences"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

export async function generateSpeech(text: string, userApiKey?: string): Promise<string | undefined> {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY || "";
  const genAi = new GoogleGenAI({ apiKey });

  const response = await genAi.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say clearly and naturally for an ESL student: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }, // Clear, natural voice
        },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
}
