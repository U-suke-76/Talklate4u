import { z } from 'zod';

export const DEFAULT_CUSTOM_CSS = `/* Custom Subtitle Styles */
.subtitle-line {
  box-shadow: none;
  padding: 0;
  margin-bottom: 5px;
  width: 100%;
  text-align: left;
  opacity: 0;
  transform: translateY(20px);
  animation: fadeInUp 0.5s forwards;
  max-height: 500px;
  overflow: hidden;
}

.subtitle-content {
  background-color: transparent;
  color: #ffffff;
  -webkit-text-stroke: 3px #000000;
  paint-order: stroke fill;
  padding: 5px 10px 5px 30px;
  border-radius: 4px;
  display: inline-block;
  font-size: 16px;
  font-weight: 800;
}

.dst-text {
  color: #38bdf8;
  -webkit-text-stroke: 3px #0c4a6e;
}

/* Custom Fade Out Animation */
.subtitle-line.fade-out {
  animation: fadeOut 0.2s forwards;
}

@keyframes fadeInUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes fadeOut {
  to {
    opacity: 0;
    transform: translateY(-20px);
    max-height: 0;
    padding-top: 0;
    padding-bottom: 0;
    margin-bottom: 0;
  }
}
`;

export const DEFAULT_OVERLAY_STYLES = {
  align: 'left' as const,
  fontSize: 16,
  originalColor: '#ffffff',
  originalStrokeColor: '#000000',
  translatedColor: '#38bdf8',
  translatedStrokeColor: '#0c4a6e',
  backgroundColor: 'transparent',
  displayFormat: '%1(%2)',
  maxLines: 0,
  fadeTimeout: 0,
  useCustomCSS: false,
  customCSS: '',
};

export const OverlayStylesSchema = z.object({
  align: z.enum(['left', 'center', 'right']).default(DEFAULT_OVERLAY_STYLES.align),
  fontSize: z.number().default(DEFAULT_OVERLAY_STYLES.fontSize),
  originalColor: z.string().default(DEFAULT_OVERLAY_STYLES.originalColor),
  originalStrokeColor: z.string().default(DEFAULT_OVERLAY_STYLES.originalStrokeColor),
  translatedColor: z.string().default(DEFAULT_OVERLAY_STYLES.translatedColor),
  translatedStrokeColor: z.string().default(DEFAULT_OVERLAY_STYLES.translatedStrokeColor),
  backgroundColor: z.string().default(DEFAULT_OVERLAY_STYLES.backgroundColor),
  displayFormat: z.string().default(DEFAULT_OVERLAY_STYLES.displayFormat),
  maxLines: z.number().default(DEFAULT_OVERLAY_STYLES.maxLines),
  fadeTimeout: z.number().default(DEFAULT_OVERLAY_STYLES.fadeTimeout),
  useCustomCSS: z.boolean().default(DEFAULT_OVERLAY_STYLES.useCustomCSS),
  customCSS: z.string().default(DEFAULT_OVERLAY_STYLES.customCSS),
});

export type OverlayStyles = z.infer<typeof OverlayStylesSchema>;

export const GlossaryEntrySchema = z.object({
  id: z.string(),
  sourceText: z.string(),
  sourceLang: z.string(),
  targetText: z.string(),
  targetLang: z.string(),
  bidirectional: z.boolean().optional(),
});

export type GlossaryEntry = z.infer<typeof GlossaryEntrySchema>;

/**
 * Imported multilingual TSV glossary pack (header: `pos\tja\ten\tko\tzh`).
 * Only terms that appear in the input text are injected into prompts.
 */
export const GlossaryPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  /** Raw TSV file contents (a ZIP pack may contain multiple TSV files). */
  contents: z.array(z.string()),
  rowCount: z.number(),
});

export type GlossaryPack = z.infer<typeof GlossaryPackSchema>;

export const AppConfigSchema = z.object({
  whisper: z.object({
    model: z.string(),
    language: z.string(),
    serverPort: z.number(),
    extraArgs: z.string().optional(),
    binPath: z.string().optional(),
    systemPrompt: z.string().optional(),
    provider: z.enum(['local', 'groq', 'openai', 'sensevoice']).default('local'),
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
  }),
  llm: z.object({
    provider: z.enum(['groq', 'openai', 'plamo-local']),
    baseUrl: z.string().optional(),
    apiKey: z.string(),
    model: z.string(),
    groqModels: z.array(z.string()).optional(),
  }),
  translation: z.object({
    targetLang: z.string(),
    streamingDisplay: z.boolean().optional().default(false),
  }),
  vad: z.object({
    silenceDurationMs: z.number(),
    positiveSpeechThreshold: z.number(),
    negativeSpeechThreshold: z.number(),
    minSpeechMs: z.number(),
    volumeThreshold: z.number().optional(),
  }),
  overlay: z.object({
    port: z.number(),
    styles: OverlayStylesSchema.optional().default(DEFAULT_OVERLAY_STYLES),
  }),
  app: z.object({
    defaultMicName: z.string(),
  }),
  glossary: z.array(GlossaryEntrySchema).optional(),
  glossaryPacks: z.array(GlossaryPackSchema).optional(),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;

export interface WhisperModel {
  value: string;
  name: string;
  exists: boolean;
}

export interface MicrophoneEntry {
  deviceId: string;
  label: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  whisper: {
    model: 'ggml-base.bin',
    serverPort: 8081,
    language: 'ja',
    extraArgs: '',
    provider: 'local',
    apiKey: '',
    baseUrl: '',
  },
  llm: { provider: 'groq', apiKey: '', model: 'auto', groqModels: [] },
  translation: { targetLang: 'auto', streamingDisplay: false },
  app: { defaultMicName: '' },
  vad: {
    silenceDurationMs: 500,
    positiveSpeechThreshold: 0.5,
    negativeSpeechThreshold: 0.35,
    minSpeechMs: 250,
    volumeThreshold: 0,
  },
  overlay: {
    port: 9000,
    styles: {
      ...DEFAULT_OVERLAY_STYLES,
      customCSS: DEFAULT_CUSTOM_CSS,
    },
  },
  glossary: [],
  glossaryPacks: [],
};
