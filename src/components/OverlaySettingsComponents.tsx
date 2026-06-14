import React from 'react';

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

export const generateCustomCSSFromStyles = (styles: OverlayStyles): string => {
  return `/* Custom Subtitle Styles */
.subtitle-line {
  box-shadow: none;
  padding: 0;
  margin-bottom: 5px;
  width: 100%;
  text-align: ${styles.align || 'left'};
  opacity: 0;
  transform: translateY(20px);
  animation: fadeInUp 0.5s forwards;
  max-height: 500px;
  overflow: hidden;
}

.subtitle-content {
  background-color: ${styles.backgroundColor || 'transparent'};
  color: ${styles.originalColor || '#ffffff'};
  -webkit-text-stroke: 3px ${styles.originalStrokeColor || '#000000'};
  paint-order: stroke fill;
  padding: 5px 10px 5px 30px;
  border-radius: 4px;
  display: inline-block;
  font-size: ${styles.fontSize || 16}px;
  font-weight: 800;
}

.dst-text {
  color: ${styles.translatedColor || '#38bdf8'};
  -webkit-text-stroke: 3px ${styles.translatedStrokeColor || '#0c4a6e'};
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
};

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
  maxLines: number;
  fadeTimeout: number;
  useCustomCSS: boolean;
  customCSS: string;
}

interface OverlaySettingsProps {
  styles: OverlayStyles;
  onChange: (styles: OverlayStyles) => void;
}

export const OverlaySettingsComponents: React.FC<OverlaySettingsProps> = ({ styles, onChange }) => {
  const handleChange = (key: keyof OverlayStyles, value: string | number | boolean) => {
    onChange({ ...styles, [key]: value });
  };

  return (
    <div className="py-4 grid grid-cols-[140px_1fr] gap-4 items-center">
      <div className="col-span-2 text-lg font-bold text-gray-300 mb-2">Overlay Appearance</div>

      {/* Preview Box */}
      {!styles.useCustomCSS && (
        <div className="col-span-2 mb-4 p-4 border border-gray-700 rounded bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')]">
          <div className="text-xs text-gray-500 mb-2">Preview (Background may be transparent)</div>
          <div
            style={{
              textAlign: styles.align,
              padding: '10px',
            }}
          >
            <div
              style={{
                backgroundColor: styles.backgroundColor,
                fontSize: `${styles.fontSize}px`,
                fontWeight: 800,
                marginBottom: '4px',
                padding: '5px 10px 5px 30px',
                borderRadius: '4px',
                display: 'inline-block',
              }}
            >
              <div
                dangerouslySetInnerHTML={{
                  __html: styles.displayFormat
                    .replace(
                      /([([{]?\s*%2\s*[)\]}]?)/g,
                      `<span style="color: ${styles.translatedColor}; -webkit-text-stroke: 3px ${styles.translatedStrokeColor}; paint-order: stroke fill;">$1</span>`,
                    )
                    .replace(
                      /%1/g,
                      `<span style="color: ${styles.originalColor}; -webkit-text-stroke: 3px ${styles.originalStrokeColor}; paint-order: stroke fill;">Original Text</span>`,
                    )
                    .replace(/%2/g, '翻訳テキスト'),
                }}
              />
              {!styles.displayFormat.includes('%1') && !styles.displayFormat.includes('%2') && (
                <span style={{ color: 'red' }}>Invalid Format</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Alignment */}
      <label className="font-bold text-gray-300">Alignment</label>
      <div className="join">
        <button
          className={`join-item btn btn-sm ${
            styles.align === 'left' && !styles.useCustomCSS ? 'btn-primary' : ''
          }`}
          onClick={() => handleChange('align', 'left')}
          disabled={styles.useCustomCSS}
        >
          Left
        </button>
        <button
          className={`join-item btn btn-sm ${
            styles.align === 'center' && !styles.useCustomCSS ? 'btn-primary' : ''
          }`}
          onClick={() => handleChange('align', 'center')}
          disabled={styles.useCustomCSS}
        >
          Center
        </button>
        <button
          className={`join-item btn btn-sm ${
            styles.align === 'right' && !styles.useCustomCSS ? 'btn-primary' : ''
          }`}
          onClick={() => handleChange('align', 'right')}
          disabled={styles.useCustomCSS}
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
        disabled={styles.useCustomCSS}
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
          disabled={styles.useCustomCSS}
        />
        <input
          aria-label="Original Text Color Code"
          type="text"
          value={styles.originalColor}
          onChange={(e) => handleChange('originalColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
          disabled={styles.useCustomCSS}
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
          disabled={styles.useCustomCSS}
        />
        <input
          aria-label="Original Stroke Color Code"
          type="text"
          value={styles.originalStrokeColor}
          onChange={(e) => handleChange('originalStrokeColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
          disabled={styles.useCustomCSS}
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
          disabled={styles.useCustomCSS}
        />
        <input
          aria-label="Translated Text Color Code"
          type="text"
          value={styles.translatedColor}
          onChange={(e) => handleChange('translatedColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
          disabled={styles.useCustomCSS}
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
          disabled={styles.useCustomCSS}
        />
        <input
          aria-label="Translated Stroke Color Code"
          type="text"
          value={styles.translatedStrokeColor}
          onChange={(e) => handleChange('translatedStrokeColor', e.target.value)}
          className="input input-sm input-bordered w-24 font-mono"
          disabled={styles.useCustomCSS}
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
          disabled={styles.useCustomCSS}
        />
        <div
          className="w-8 h-8 border border-gray-600"
          style={{ backgroundColor: styles.useCustomCSS ? 'transparent' : styles.backgroundColor }}
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
          disabled={styles.useCustomCSS}
        />
        <span className="text-xs text-gray-500">
          Available placeholders: <span className="font-mono text-secondary">%1</span> (Original),{' '}
          <span className="font-mono text-secondary">%2</span> (Translated)
        </span>
      </div>

      {/* Line & Timeout Controls */}
      <div className="col-span-2 divider text-gray-500">Behavior</div>

      {/* Max Lines */}
      <label className="font-bold text-gray-300">Max Lines (0 for unlimited)</label>
      <input
        aria-label="Max Lines"
        type="number"
        min="0"
        max="50"
        className="input input-bordered w-full"
        value={styles.maxLines ?? 0}
        onChange={(e) => handleChange('maxLines', parseInt(e.target.value) || 0)}
      />

      {/* Fade Out Delay */}
      <label className="font-bold text-gray-300">Fade Out Delay (seconds, 0 to disable)</label>
      <input
        aria-label="Fade Out Delay"
        type="number"
        min="0"
        max="300"
        className="input input-bordered w-full"
        value={styles.fadeTimeout ?? 0}
        onChange={(e) => handleChange('fadeTimeout', parseInt(e.target.value) || 0)}
      />

      {/* Custom CSS Toggle */}
      <div className="col-span-2 divider text-gray-500">Custom CSS</div>
      <label className="font-bold text-gray-300">Use Custom CSS</label>
      <input
        aria-label="Use Custom CSS"
        type="checkbox"
        className="checkbox checkbox-primary"
        checked={styles.useCustomCSS ?? false}
        onChange={(e) => {
          const checked = e.target.checked;
          let nextCustomCSS = styles.customCSS;
          if (checked) {
            const isDefaultOrEmpty =
              !styles.customCSS ||
              styles.customCSS.trim() === '' ||
              styles.customCSS === DEFAULT_CUSTOM_CSS;
            if (isDefaultOrEmpty) {
              nextCustomCSS = generateCustomCSSFromStyles(styles);
            }
          }
          onChange({
            ...styles,
            useCustomCSS: checked,
            customCSS: nextCustomCSS,
          });
        }}
      />

      {styles.useCustomCSS && (
        <>
          <div className="font-bold text-gray-300 align-top pt-2 flex flex-col gap-2">
            <span>Custom CSS</span>
            <button
              type="button"
              className="btn btn-xs btn-outline btn-secondary w-fit"
              onClick={() => {
                if (
                  !styles.customCSS ||
                  styles.customCSS.trim() === '' ||
                  styles.customCSS === DEFAULT_CUSTOM_CSS ||
                  window.confirm(
                    '現在のUI設定でカスタムCSSを上書きしますか？（手動で編集したCSSは失われます）',
                  )
                ) {
                  handleChange('customCSS', generateCustomCSSFromStyles(styles));
                }
              }}
            >
              Load from UI
            </button>
          </div>
          <div className="flex flex-col gap-1 w-full">
            <textarea
              aria-label="Custom CSS Editor"
              className="textarea textarea-bordered w-full h-64 font-mono text-sm"
              value={styles.customCSS ?? ''}
              onChange={(e) => handleChange('customCSS', e.target.value)}
              placeholder="/* Add your custom styles here */"
            />
            <span className="text-xs text-gray-500">
              Classes like <span className="font-mono text-secondary">.subtitle-line</span> and{' '}
              <span className="font-mono text-secondary">.subtitle-line.fade-out</span> can be
              customized.
            </span>
          </div>
        </>
      )}
    </div>
  );
};
