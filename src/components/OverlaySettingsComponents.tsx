import React from 'react';

// Define the styles interface compatible with ConfigManager
export interface OverlayStyles {
  align: 'left' | 'center' | 'right';
  fontSize: number;
  originalColor: string;
  originalStrokeColor: string;
  translatedColor: string;
  translatedStrokeColor: string;
  backgroundColor: string;
  displayFormat: string;
}

interface OverlaySettingsProps {
  styles: OverlayStyles;
  onChange: (styles: OverlayStyles) => void;
}

export const OverlaySettingsComponents: React.FC<OverlaySettingsProps> = ({ styles, onChange }) => {
  const handleChange = (key: keyof OverlayStyles, value: string | number) => {
    onChange({ ...styles, [key]: value });
  };

  return (
    <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
      <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">Overlay Appearance</div>

      {/* Preview Box */}
      <div className="col-span-2 mb-4 p-4 border border-gray-700 rounded bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
        <div className="text-xs text-gray-500 mb-2">Preview (Background may be transparent)</div>
        <div
          style={{
            backgroundColor: styles.backgroundColor,
            textAlign: styles.align,
            padding: '10px',
            borderRadius: '4px',
          }}
        >
          <div
            style={{
              fontSize: `${styles.fontSize}px`,
              fontWeight: 800,
              marginBottom: '4px',
            }}
          >
            {/* Simulation of Text Rendering based on format would be complex here due to HTML parsing, 
                so we just show a static example or try to render simpler version. 
                Let's emulate the structure roughly. */}
            {styles.displayFormat.includes('%1') && (
              <span
                style={{
                  color: styles.originalColor,
                  WebkitTextStroke: `3px ${styles.originalStrokeColor}`,
                  paintOrder: 'stroke fill',
                  marginRight: '8px',
                }}
              >
                Original Text
              </span>
            )}
            {styles.displayFormat.includes('%2') && (
              <span
                style={{
                  color: styles.translatedColor,
                  WebkitTextStroke: `3px ${styles.translatedStrokeColor}`,
                  paintOrder: 'stroke fill',
                }}
              >
                (翻訳テキスト)
              </span>
            )}
            {!styles.displayFormat.includes('%1') && !styles.displayFormat.includes('%2') && (
              <span style={{ color: 'red' }}>Invalid Format</span>
            )}
          </div>
        </div>
      </div>

      {/* Alignment */}
      <label className="font-bold text-gray-300">Alignment</label>
      <div className="join">
        <button
          className={`join-item btn btn-sm ${styles.align === 'left' ? 'btn-primary' : ''}`}
          onClick={() => handleChange('align', 'left')}
        >
          Left
        </button>
        <button
          className={`join-item btn btn-sm ${styles.align === 'center' ? 'btn-primary' : ''}`}
          onClick={() => handleChange('align', 'center')}
        >
          Center
        </button>
        <button
          className={`join-item btn btn-sm ${styles.align === 'right' ? 'btn-primary' : ''}`}
          onClick={() => handleChange('align', 'right')}
        >
          Right
        </button>
      </div>

      {/* Font Size */}
      <label className="font-bold text-gray-300">Font Size ({styles.fontSize}px)</label>
      <input
        aria-label="Font Size"
        type="range"
        min="12"
        max="72"
        className="range range-xs range-primary"
        value={styles.fontSize}
        onChange={(e) => handleChange('fontSize', parseInt(e.target.value))}
      />

      {/* Colors - Original */}
      <div className="col-span-2 text-sm font-bold text-gray-400 mt-2">Original Text (%1)</div>
      <label className="font-bold text-gray-300 pl-4">Text Color</label>
      <div className="flex gap-2">
        <input
          aria-label="Original Text Color"
          type="color"
          value={styles.originalColor}
          onChange={(e) => handleChange('originalColor', e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
        />
        <input
          aria-label="Original Text Color Code"
          type="text"
          value={styles.originalColor}
          onChange={(e) => handleChange('originalColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
        />
      </div>

      <label className="font-bold text-gray-300 pl-4">Stroke Color</label>
      <div className="flex gap-2">
        <input
          aria-label="Original Stroke Color"
          type="color"
          value={styles.originalStrokeColor}
          onChange={(e) => handleChange('originalStrokeColor', e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
        />
        <input
          aria-label="Original Stroke Color Code"
          type="text"
          value={styles.originalStrokeColor}
          onChange={(e) => handleChange('originalStrokeColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
        />
      </div>

      {/* Colors - Translated */}
      <div className="col-span-2 text-sm font-bold text-gray-400 mt-2">Translated Text (%2)</div>
      <label className="font-bold text-gray-300 pl-4">Text Color</label>
      <div className="flex gap-2">
        <input
          aria-label="Translated Text Color"
          type="color"
          value={styles.translatedColor}
          onChange={(e) => handleChange('translatedColor', e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
        />
        <input
          aria-label="Translated Text Color Code"
          type="text"
          value={styles.translatedColor}
          onChange={(e) => handleChange('translatedColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
        />
      </div>

      <label className="font-bold text-gray-300 pl-4">Stroke Color</label>
      <div className="flex gap-2">
        <input
          aria-label="Translated Stroke Color"
          type="color"
          value={styles.translatedStrokeColor}
          onChange={(e) => handleChange('translatedStrokeColor', e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
        />
        <input
          aria-label="Translated Stroke Color Code"
          type="text"
          value={styles.translatedStrokeColor}
          onChange={(e) => handleChange('translatedStrokeColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
        />
      </div>

      {/* Background (Global) */}
      <div className="col-span-2 text-sm font-bold text-gray-400 mt-2">Background</div>
      <label className="font-bold text-gray-300 pl-4">Background</label>
      <div className="flex gap-2 items-center">
        <input
          aria-label="Background Color"
          type="text"
          value={styles.backgroundColor}
          onChange={(e) => handleChange('backgroundColor', e.target.value)}
          className="input input-sm input-bordered w-full font-mono"
          placeholder="transparent, rgba(0,0,0,0.5), #000"
        />
        <div
          className="w-8 h-8 border border-gray-600"
          style={{ backgroundColor: styles.backgroundColor }}
          title="Preview"
        />
      </div>

      {/* Format */}
      <div className="col-span-2 divider text-gray-500">Format</div>
      <label className="font-bold text-gray-300">Display Format</label>
      <div className="flex flex-col gap-1 w-full">
        <input
          aria-label="Display Format"
          type="text"
          value={styles.displayFormat}
          onChange={(e) => handleChange('displayFormat', e.target.value)}
          className="input input-bordered w-full font-mono"
          placeholder="%1(%2)"
        />
        <span className="text-xs text-gray-500">
          Available placeholders: <span className="font-mono text-secondary">%1</span> (Original),{' '}
          <span className="font-mono text-secondary">%2</span> (Translated)
        </span>
      </div>
    </div>
  );
};
