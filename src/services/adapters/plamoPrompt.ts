export function normalizeLangCode(lang?: string | null): string {
  if (!lang || lang === 'auto') return '';
  const l = lang.trim().toLowerCase();
  if (l === 'japanese' || l === '日本語' || l === 'ja') return 'ja';
  if (l === 'english' || l === '英語' || l === 'en') return 'en';
  if (l === 'korean' || l === '韓国語' || l === 'ko') return 'ko';
  if (l === 'chinese' || l === '中国語' || l === 'zh' || l === 'zh-cn') return 'zh-hans';
  if (l === 'zh-tw') return 'zh-hant';
  if (l === 'spanish' || l === 'es') return 'es';
  if (l === 'french' || l === 'fr') return 'fr';
  if (l === 'german' || l === 'de') return 'de';
  return l;
}

export interface PlamoChatTemplateOptions {
  targetLang?: string;
  sourceLang?: string;
  glossary?: Array<{ source: string; target: string }>;
  context?: string;
  form?: 'polite' | 'plain';
}

export function buildPlamoChatTemplateKwargs(
  options: PlamoChatTemplateOptions,
): Record<string, unknown> {
  const kwargs: Record<string, unknown> = {};

  const target = normalizeLangCode(options.targetLang);
  kwargs.target_lang = target || 'ja';

  const source = normalizeLangCode(options.sourceLang);
  if (source && source !== 'auto') {
    kwargs.source_lang = source;
  }

  if (options.glossary && options.glossary.length > 0) {
    kwargs.glossary = options.glossary
      .filter(
        (item) =>
          item.source &&
          item.target &&
          !item.source.includes('<|plamo:') &&
          !item.target.includes('<|plamo:'),
      )
      .map((item) => ({
        source: item.source.trim(),
        target: item.target.split('/')[0].trim(),
      }));
  }

  if (options.context && !options.context.includes('<|plamo:')) {
    kwargs.context = options.context;
  }

  if (kwargs.target_lang === 'ja') {
    kwargs.form = options.form || 'plain';
  }

  return kwargs;
}

/**
 * Builds the official `[plamo-translate]` system message supported by PFNet's GGUF Jinja chat_template.
 * This ensures `target_lang`, `source_lang`, `form`, `glossary`, and `context` work across all transports
 * (Wllama, Bionic / LM Studio, llama-server) regardless of whether `chat_template_kwargs` is supported.
 */
export function buildPlamoSystemMessage(options: PlamoChatTemplateOptions): string {
  const lines: string[] = ['[plamo-translate]'];

  const target = normalizeLangCode(options.targetLang) || 'ja';
  lines.push(`target_lang=${target}`);

  const source = normalizeLangCode(options.sourceLang);
  if (source && source !== 'auto') {
    lines.push(`source_lang=${source}`);
  }

  if (target === 'ja') {
    lines.push(`form=${options.form || 'plain'}`);
  }

  if (options.glossary && options.glossary.length > 0) {
    for (const item of options.glossary) {
      const src = item.source?.trim();
      const tgt = item.target?.split('/')[0]?.trim();
      if (
        src &&
        tgt &&
        !src.includes('<|plamo:') &&
        !tgt.includes('<|plamo:') &&
        !src.includes('=>') &&
        !tgt.includes('=>') &&
        !src.includes('\n') &&
        !tgt.includes('\n')
      ) {
        lines.push(`glossary=${src} => ${tgt}`);
      }
    }
  }

  const cleanContext = options.context?.replace(/\r/g, '').trim();
  if (cleanContext && !cleanContext.includes('<|plamo:')) {
    lines.push('---');
    lines.push(cleanContext);
  }

  return lines.join('\n');
}

export interface PlamoPfmlPromptOptions {
  text: string;
  targetLang?: string;
  sourceLang?: string;
  glossary?: Array<{ source: string; target: string }>;
  context?: string;
  form?: 'polite' | 'plain';
}

export const PFML3 = {
  tag: '<|plamo:tag|>',
  msg: '<|plamo:msg|>',
  key: '<|plamo:key|>',
  val: '<|plamo:val|>',
  index: '<|plamo:index|>',
  item: '<|plamo:item|>',
} as const;

export const PLAMO_BOS_TOKEN = '<|plamo:bos|>';

export function buildPlamoPfmlPrompt(options: PlamoPfmlPromptOptions): string {
  const text = options.text.trim();
  const target = normalizeLangCode(options.targetLang) || 'ja';
  const source = normalizeLangCode(options.sourceLang);

  let prompt = `${PFML3.tag}dataset${PFML3.msg}translation`;

  if (
    options.context &&
    options.context.trim().length > 0 &&
    !options.context.includes('<|plamo:')
  ) {
    prompt += `${PFML3.tag}context${PFML3.msg}${options.context.trim()}`;
  }

  if (options.glossary && options.glossary.length > 0) {
    const validGlossary = options.glossary.filter(
      (item) =>
        item.source &&
        item.target &&
        !item.source.includes('<|plamo:') &&
        !item.target.includes('<|plamo:'),
    );
    if (validGlossary.length > 0) {
      prompt += `${PFML3.tag}glossary`;
      for (const entry of validGlossary) {
        const src = entry.source.trim();
        const tgt = entry.target.split('/')[0].trim();
        prompt += `${PFML3.index}${src}${PFML3.item}${tgt}`;
      }
    }
  }

  prompt += `${PFML3.tag}input`;
  if (source && source !== 'auto') {
    prompt += `${PFML3.key}lang${PFML3.val}${source}`;
  }
  prompt += `${PFML3.msg}${text}`;

  prompt += `${PFML3.tag}output${PFML3.key}lang${PFML3.val}${target}`;

  const form = options.form || (target === 'ja' ? 'plain' : undefined);
  if (form && target === 'ja') {
    prompt += `${PFML3.key}form${PFML3.val}${form}`;
  }

  return `${prompt}${PFML3.msg}`;
}

export function removeRepetitionLoops(text: string): string {
  if (!text || text.length < 6) {
    return text;
  }

  let cleaned = text;
  cleaned = cleaned.replace(/([^\s\w/.-])\1{6,}/gu, (_match, char: string) => char.repeat(3));
  cleaned = cleaned.replace(/([A-Za-z0-9])\1{9,}/g, (_match, char: string) => char.repeat(3));

  const loopRegex =
    /([^\s\r\n]{2,30}|[^\r\n]{2,30}?)(?:[\s、。！？!?]+\1|\1){2,}(?:[\s、。！？!?]*)?/gu;
  if (loopRegex.test(cleaned)) {
    cleaned = cleaned.replace(loopRegex, (match, unit: string) => {
      const trimmedUnit = unit.trim();
      const count = Math.round(match.length / unit.length);
      if (trimmedUnit.length === 2 && count < 4) {
        return match;
      }
      const firstDelimiterMatch = match.slice(unit.length).match(/^[\s、。！？!?]+/);
      const delimiter = firstDelimiterMatch ? firstDelimiterMatch[0].trimEnd() : '';
      return `${unit}${delimiter}`.trim();
    });
  }

  return cleaned.trim();
}

const CJK_SPACE_REGEX =
  /(?<=[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF])\s+(?=[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF])/gu;

export function cleanPlamoOutput(value: string): string {
  let output = value;
  for (const marker of [PFML3.tag, PLAMO_BOS_TOKEN, '<|end_of_text|>']) {
    const index = output.indexOf(marker);
    if (index !== -1) output = output.slice(0, index);
  }
  output = output.replace(CJK_SPACE_REGEX, '').trim();
  output = removeRepetitionLoops(output);
  return output;
}

export const PLAMO_STOP_TOKENS = [PFML3.tag, PLAMO_BOS_TOKEN, '<|end_of_text|>'];
