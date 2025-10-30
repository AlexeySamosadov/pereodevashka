import React, { useState, useCallback, useEffect, useRef } from 'react';
import { virtualTryOn, removeBackground, getClothingSuggestions, generateClothingImage } from './services/geminiService';
import { translations, TranslationKey } from './translations';
import type { UploadedImage } from './types';

// Helper function to convert a File object to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      if (!base64) {
        reject(new Error("Failed to read base64 string from file."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

// Helper function to convert a data URL to a File object for the Web Share API
const dataURLtoFile = (dataurl: string, filename: string): File | null => {
  const arr = dataurl.split(',');
  if (arr.length < 2) return null;
  const mimeMatch = arr[0].match(/:(.*?);/);
  if (!mimeMatch) return null;
  const mime = mimeMatch[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
};


// --- Types ---
interface HistoryItem {
  person: string;
  clothing: string;
  result: string;
}

type StyleTheme = 'Photorealistic' | 'Magazine Cover' | 'Artistic';
type Language = 'en' | 'ru';
type Theme = 'light' | 'dark' | 'sunset';


interface SavedSession {
    personImage: string; // base64 data URL
    clothingImage: string; // base64 data URL
    removeBgEnabled: boolean;
    styleTheme: StyleTheme;
}


interface ClothingSuggestion {
  name: string;
  description: string;
}

// --- Custom Hooks ---

const useTheme = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const savedTheme = localStorage.getItem('trayonTheme') as Theme;
      return savedTheme || 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    document.documentElement.className = `theme-${theme}`;
    try {
        localStorage.setItem('trayonTheme', theme);
    } catch (e) {
        console.error("Failed to save theme", e);
    }
  }, [theme]);

  return { theme, setTheme };
};

const useLocalization = () => {
    const [language, setLanguage] = useState<Language>(() => {
        try {
            const savedLang = localStorage.getItem('trayonLanguage') as Language;
            return savedLang || 'ru';
        } catch {
            return 'ru';
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('trayonLanguage', language);
        } catch (e) {
            console.error("Failed to save language", e);
        }
    }, [language]);

    const t = useCallback((key: TranslationKey, ...args: any[]) => {
        let translation = translations[language][key] || translations['en'][key];
        if (args.length > 0) {
            args.forEach((arg, index) => {
                translation = translation.replace(`{${index}}`, arg);
            });
        }
        return translation;
    }, [language]);

    return { language, setLanguage, t };
};


// --- Sub-components ---

const Header: React.FC<{
  t: (key: TranslationKey, ...args: any[]) => string;
  theme: Theme;
  setTheme: (theme: Theme) => void;
  language: Language;
  setLanguage: (lang: Language) => void;
}> = ({ t, theme, setTheme, language, setLanguage }) => {
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setIsSettingsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const themes: {id: Theme, key: TranslationKey, bg: string, primary: string, secondary: string}[] = [
        { id: 'light', key: 'themeLight', bg: 'rgb(240 244 248)', primary: 'rgb(79 70 229)', secondary: 'rgb(236 72 153)'},
        { id: 'dark', key: 'themeDark', bg: 'rgb(0 0 0)', primary: 'rgb(99 102 241)', secondary: 'rgb(244 114 182)'},
        { id: 'sunset', key: 'themeSunset', bg: 'rgb(0 0 0)', primary: 'rgb(251 146 60)', secondary: 'rgb(239 68 68)'},
    ];

    return (
        <header className="w-full text-center p-4 relative">
            <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary tracking-tight">
              Trayon
            </h1>
            <p className="text-brand-subtle mt-1">{t('appSubtitle')}</p>

            <div className="absolute top-4 right-4" ref={settingsRef}>
                <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="p-2 rounded-full text-brand-subtle hover:bg-brand-surface hover:text-brand-text transition-colors"
                    aria-label={t('settings')}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                </button>
                {isSettingsOpen && (
                     <div className="absolute top-full right-0 mt-2 w-72 bg-brand-surface/70 backdrop-blur-xl rounded-xl shadow-2xl border border-brand-stroke/30 p-4 z-50 animate-fade-in-fast">
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-semibold text-brand-text mb-3 text-center">{t('theme')}</label>
                                <div className="grid grid-cols-3 gap-3">
                                    {themes.map(themeItem => (
                                        <div key={themeItem.id} onClick={() => setTheme(themeItem.id)} className="cursor-pointer text-center group">
                                            <div className={`w-full h-16 rounded-lg flex items-center justify-center p-2 border-2 transition-colors ${theme === themeItem.id ? 'border-brand-primary' : 'border-brand-stroke/50 group-hover:border-brand-primary/70'}`} style={{backgroundColor: themeItem.bg}}>
                                                <div className="flex gap-1.5">
                                                    <div className="w-4 h-8 rounded" style={{backgroundColor: themeItem.primary}}></div>
                                                    <div className="w-4 h-8 rounded" style={{backgroundColor: themeItem.secondary}}></div>
                                                </div>
                                            </div>
                                            <p className={`mt-1.5 text-xs font-medium transition-colors ${theme === themeItem.id ? 'text-brand-primary' : 'text-brand-subtle group-hover:text-brand-text'}`}>{t(themeItem.key)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-brand-text mb-3 text-center">{t('language')}</label>
                                 <div className="flex w-full bg-brand-bg p-1 rounded-lg border border-brand-stroke/50">
                                    <button
                                        onClick={() => setLanguage('en')}
                                        className={`w-1/2 py-1.5 text-sm font-semibold rounded-md transition-all duration-200 ${language === 'en' ? 'bg-brand-primary text-white shadow' : 'text-brand-subtle hover:bg-brand-surface/50'}`}
                                    >
                                        {t('langEn')}
                                    </button>
                                    <button
                                        onClick={() => setLanguage('ru')}
                                        className={`w-1/2 py-1.5 text-sm font-semibold rounded-md transition-all duration-200 ${language === 'ru' ? 'bg-brand-primary text-white shadow' : 'text-brand-subtle hover:bg-brand-surface/50'}`}
                                    >
                                        {t('langRu')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </header>
    );
};

interface ImageUploaderProps {
  id: string;
  image: UploadedImage | null;
  onImageChange: (file: File) => void;
  icon: React.ReactNode;
  t: (key: TranslationKey, ...args: any[]) => string;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ id, image, onImageChange, icon, t }) => {
  const [isDragging, setIsDragging] = useState(false);
  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };
  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onImageChange(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };
  
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onImageChange(e.target.files[0]);
    }
  };

  return (
    <div className="w-full flex justify-center">
        <label
          htmlFor={id}
          className="group relative flex justify-center items-center w-52 h-72 border border-brand-stroke rounded-xl cursor-pointer bg-brand-surface transition-all duration-300 shadow-sm hover:shadow-md"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {image ? (
            <>
              <img src={image.previewUrl} alt="Preview" className="object-cover w-full h-full rounded-xl" />
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-xl">
                <div className="text-center">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 mx-auto">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.181-3.183m-4.991-2.691V5.25a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25h6.75a2.25 2.25 0 002.25-2.25v-2.691z" />
                  </svg>
                  <p className="font-semibold mt-1">{t('changePhoto')}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center text-brand-subtle p-4">
              <div className="w-16 h-16 mx-auto text-brand-subtle/80">
                {icon}
              </div>
              <p className="mt-2 text-sm font-medium">{t('clickToUpload')}</p>
              <p className="text-xs">{t('dragAndDrop')}</p>
            </div>
          )}
          <input id={id} name={id} type="file" className="sr-only" accept="image/*" onChange={handleFileInputChange} />
          {isDragging && (
            <div className="absolute inset-0 bg-brand-primary/20 border-2 border-dashed border-brand-primary rounded-xl flex items-center justify-center pointer-events-none">
              <div className="text-center font-bold text-brand-primary">
                <p>{t('dropImageHere')}</p>
              </div>
            </div>
          )}
        </label>
    </div>
  );
};


interface LoadingViewProps {
  personImage: UploadedImage | null;
  clothingImage: UploadedImage | null;
  loadingText: string;
  t: (key: TranslationKey, ...args: any[]) => string;
}

const LoadingView: React.FC<LoadingViewProps> = ({ personImage, clothingImage, loadingText, t }) => (
    <div className="flex flex-col items-center justify-center text-center animate-fade-in space-y-8 mt-16 md:mt-24 px-4">
        <div className="flex items-center justify-center gap-4 sm:gap-8">
            <div className="w-32 h-44 sm:w-40 sm:h-56 bg-brand-surface rounded-xl shadow-lg flex items-center justify-center">
                {personImage ? <img src={personImage.previewUrl} alt={t('person')} className="object-cover w-full h-full rounded-xl" /> : <Spinner />}
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-brand-primary animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <div className="w-32 h-44 sm:w-40 sm:h-56 bg-brand-surface rounded-xl shadow-lg flex items-center justify-center">
                {clothingImage ? <img src={clothingImage.previewUrl} alt={t('clothing')} className="object-cover w-full h-full rounded-xl" /> : <Spinner />}
            </div>
        </div>
        <p className="text-brand-subtle text-lg font-medium">{loadingText}</p>
    </div>
);


const Spinner: React.FC<{text?: string, inline?: boolean}> = ({text, inline}) => {
    if (inline) {
        return (
            <svg className="animate-spin h-5 w-5 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center space-y-4">
            <svg className="animate-spin h-10 w-10 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {text && <p className="text-brand-subtle text-lg font-medium">{text}</p>}
        </div>
    );
};

interface StartMenuProps {
  onStart: () => void;
  onViewHistory: () => void;
  onLoadSession: () => void;
  hasHistory: boolean;
  hasSavedSession: boolean;
  t: (key: TranslationKey, ...args: any[]) => string;
}

const StartMenu: React.FC<StartMenuProps> = ({ onStart, onViewHistory, onLoadSession, hasHistory, hasSavedSession, t }) => (
  <div className="flex flex-col items-center justify-center flex-grow text-center animate-fade-in space-y-8 mt-16 md:mt-24 px-4">
    <h2 className="text-3xl sm:text-4xl font-semibold text-brand-text">{t('welcomeBack')}</h2>
    <p className="text-brand-subtle max-w-md">{t('welcomeMessage')}</p>
    <div className="flex flex-col gap-4 w-full max-w-xs">
       <button 
         onClick={onStart} 
         className="w-full text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all duration-300 ease-in-out bg-gradient-to-r from-brand-primary to-brand-secondary hover:enabled:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50"
       >
         {t('startNewTryOn')}
       </button>
       <button 
         onClick={onLoadSession}
         disabled={!hasSavedSession}
         className="w-full bg-brand-surface text-brand-text font-bold py-3 px-4 rounded-xl shadow-sm transition-all duration-300 ease-in-out border border-brand-stroke/50 hover:enabled:bg-brand-stroke/20 focus:outline-none focus:ring-2 focus:ring-brand-stroke focus:ring-opacity-75 disabled:bg-brand-surface/50 disabled:text-brand-subtle/50 disabled:cursor-not-allowed"
       >
         {t('loadSavedTryOn')}
       </button>
       <button 
         onClick={onViewHistory} 
         disabled={!hasHistory}
         className="w-full bg-brand-surface text-brand-text font-bold py-3 px-4 rounded-xl shadow-sm transition-all duration-300 ease-in-out border border-brand-stroke/50 hover:enabled:bg-brand-stroke/20 focus:outline-none focus:ring-2 focus:ring-brand-stroke focus:ring-opacity-75 disabled:bg-brand-surface/50 disabled:text-brand-subtle/50 disabled:cursor-not-allowed"
       >
         {t('viewHistory')}
       </button>
    </div>
  </div>
);

const ZoomableImage: React.FC<{ src: string, alt: string, containerClassName?: string }> = ({ src, alt, containerClassName }) => {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const scaleAmount = -e.deltaY * 0.005;
    const newScale = Math.max(1, Math.min(5, transform.scale + scaleAmount));

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newX = transform.x - (mouseX - transform.x) * (newScale / transform.scale - 1);
    const newY = transform.y - (mouseY - transform.y) * (newScale / transform.scale - 1);

    setTransform({ scale: newScale, x: newX, y: newY });
  };
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    lastMousePosition.current = { x: e.clientX, y: e.clientY };
    if (containerRef.current) containerRef.current.style.cursor = 'grabbing';
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePosition.current.x;
    const dy = e.clientY - lastMousePosition.current.y;
    setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    lastMousePosition.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    isDragging.current = false;
    if (containerRef.current) containerRef.current.style.cursor = 'grab';
  };
  
  const adjustZoom = (amount: number) => {
    const newScale = Math.max(1, Math.min(5, transform.scale + amount));
    setTransform(prev => ({ ...prev, scale: newScale }));
  };
  
  const resetZoom = () => {
    setTransform({ scale: 1, x: 0, y: 0 });
  };

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-brand-surface/50 rounded-lg cursor-grab ${containerClassName}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
    >
      <img
        src={src}
        alt={alt}
        style={{ 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`, 
          transition: isDragging.current ? 'none' : 'transform 0.1s ease-out',
          maxWidth: '100%',
          maxHeight: '100%',
          width: '100%',
          height: '100%',
          objectFit: 'contain'
        }}
      />
       <div className="absolute bottom-3 right-3 flex items-center gap-1 bg-black/50 p-1.5 rounded-lg">
        <button onClick={() => adjustZoom(-0.5)} title="Zoom Out" className="w-8 h-8 flex items-center justify-center text-white text-xl rounded-md hover:bg-white/20 transition-colors">&minus;</button>
        <button onClick={() => adjustZoom(0.5)} title="Zoom In" className="w-8 h-8 flex items-center justify-center text-white text-xl rounded-md hover:bg-white/20 transition-colors">&#43;</button>
        <button onClick={resetZoom} title="Reset View" className="w-8 h-8 flex items-center justify-center text-white rounded-md hover:bg-white/20 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 4l16 16" /></svg>
        </button>
       </div>
    </div>
  );
};

const ImageModal: React.FC<{ item: HistoryItem, onClose: () => void, t: (key: TranslationKey, ...args: any[]) => string }> = ({ item, onClose, t }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="relative w-[90vw] h-[90vh] max-w-4xl bg-brand-surface/70 backdrop-blur-xl rounded-xl shadow-2xl flex flex-col border border-brand-stroke/30" 
        onClick={e => e.stopPropagation()}
      >
        <h2 id="modal-title" className="sr-only">{t('imageDetailView')}</h2>
        <button 
          onClick={onClose} 
          title={t('close')}
          aria-label={t('closeImageDetailView')}
          className="absolute top-2 right-2 z-20 w-10 h-10 flex items-center justify-center text-brand-text bg-brand-surface/50 rounded-full hover:bg-brand-stroke/50 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="flex-grow w-full p-4 min-h-0">
          <ZoomableImage src={item.result} alt={t('fullScreenTryOnView')} containerClassName="bg-transparent"/>
        </div>
        <div className="flex-shrink-0 w-full p-3 border-t border-brand-stroke">
          <h3 className="text-sm font-semibold text-brand-text mb-2 text-center">{t('sourceImages')}</h3>
          <div className="flex justify-center items-center gap-4">
            <div className="text-center">
              <img src={item.person} alt={t('originalPerson')} className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-md border-2 border-brand-stroke" />
              <p className="text-xs text-center text-brand-subtle mt-1">{t('person')}</p>
            </div>
            <div className="text-center">
               <img src={item.clothing} alt={t('originalClothing')} className="w-20 h-20 md:w-24 md:h-24 object-cover rounded-md border-2 border-brand-stroke" />
               <p className="text-xs text-center text-brand-subtle mt-1">{t('clothing')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};


// --- Main App Component ---

const App: React.FC = () => {
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLocalization();

  const [personImage, setPersonImage] = useState<UploadedImage | null>(null);
  const [clothingImage, setClothingImage] = useState<UploadedImage | null>(null);
  const [generatedImage, setGeneratedImage] = useState<{ url: string; mimeType: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const [view, setView] = useState<'start' | 'tryOn' | 'history' | 'result' | 'loading'>('start');

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);

  const [removeBgEnabled, setRemoveBgEnabled] = useState(() => {
      try {
          const saved = localStorage.getItem('trayonRemoveBg');
          return saved !== null ? JSON.parse(saved) : true;
      } catch {
          return true;
      }
  });

  const [styleTheme, setStyleTheme] = useState<StyleTheme>(() => {
    try {
        const saved = localStorage.getItem('trayonStyleTheme') as StyleTheme;
        if (saved && ['Photorealistic', 'Magazine Cover', 'Artistic'].includes(saved)) {
            return saved;
        }
        return 'Photorealistic';
    } catch {
        return 'Photorealistic';
    }
  });

  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  
  const [stylistPrompt, setStylistPrompt] = useState('');
  const [customStylistPrompt, setCustomStylistPrompt] = useState('');
  const [preferredColors, setPreferredColors] = useState('');
  const [suggestions, setSuggestions] = useState<ClothingSuggestion[]>([]);
  const [suggestionImages, setSuggestionImages] = useState<Record<string, {url: string, mimeType: string, file: File} | 'loading'>>({});

  // --- Effects ---

  // Load history, saved session, and persisted images from localStorage on initial render
  useEffect(() => {
    try {
      const savedHistory = localStorage.getItem('trayonHistory');
      if (savedHistory) {
        setHistory(JSON.parse(savedHistory));
      }
      const savedSessionData = localStorage.getItem('trayonSavedSession');
      if (savedSessionData) {
        setSavedSession(JSON.parse(savedSessionData));
      }
      // Load persisted images
      const persistedPerson = localStorage.getItem('trayonPersonImage');
      const persistedClothing = localStorage.getItem('trayonClothingImage');
      if (persistedPerson) {
        const file = dataURLtoFile(persistedPerson, 'person.png');
        if (file) setPersonImage({ file, previewUrl: persistedPerson });
      }
      if (persistedClothing) {
        const file = dataURLtoFile(persistedClothing, 'clothing.png');
        if (file) setClothingImage({ file, previewUrl: persistedClothing });
      }

    } catch (e) {
      console.error("Failed to load data from localStorage", e);
    }
  }, []);

  // Persist history to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem('trayonHistory', JSON.stringify(history));
    } catch (e) {
      console.error("Failed to save history", e);
    }
  }, [history]);

  // Persist remove background toggle state
  useEffect(() => {
    try {
      localStorage.setItem('trayonRemoveBg', JSON.stringify(removeBgEnabled));
    } catch (e) {
      console.error("Failed to save removeBg setting", e);
    }
  }, [removeBgEnabled]);

  // Persist style theme
  useEffect(() => {
    try {
      localStorage.setItem('trayonStyleTheme', styleTheme);
    } catch (e) {
      console.error("Failed to save style theme", e);
    }
  }, [styleTheme]);

  // Persist uploaded images
  useEffect(() => {
    try {
        if (personImage) {
            localStorage.setItem('trayonPersonImage', personImage.previewUrl);
        } else {
            localStorage.removeItem('trayonPersonImage');
        }
    } catch (e) { console.error("Failed to save person image", e); }
  }, [personImage]);

  useEffect(() => {
    try {
        if (clothingImage) {
            localStorage.setItem('trayonClothingImage', clothingImage.previewUrl);
        } else {
            localStorage.removeItem('trayonClothingImage');
        }
    } catch (e) { console.error("Failed to save clothing image", e); }
  }, [clothingImage]);

  
  // --- Handlers ---

  const handleImageChange = (
    setter: React.Dispatch<React.SetStateAction<UploadedImage | null>>
  ) => (file: File) => {
    if (!file.type.startsWith('image/')) {
        setError(t('errorInvalidImage'));
        return;
    }
    const previewUrl = URL.createObjectURL(file);
    setter({ file, previewUrl });
    setError(null);
  };
  
  const handleTryOn = async () => {
    if (!personImage || !clothingImage) {
      setError(t('errorNeedBothImagesUpload'));
      return;
    }
    
    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);
    setView('loading');
    
    try {
      setLoadingText(t('magicMessage'));
      let personBase64 = await fileToBase64(personImage.file);
      let personMimeType = personImage.file.type;
      
      if (removeBgEnabled) {
          setLoadingText(t('removingBackground'));
          const bgRemoved = await removeBackground(personBase64, personMimeType);
          personBase64 = bgRemoved.data;
          personMimeType = bgRemoved.mimeType;
      }
      
      setLoadingText(t('generatingLook'));
      const clothingBase64 = await fileToBase64(clothingImage.file);
      const result = await virtualTryOn(personBase64, personMimeType, clothingBase64, clothingImage.file.type, styleTheme);
      
      const resultUrl = `data:${result.mimeType};base64,${result.data}`;
      setGeneratedImage({ url: resultUrl, mimeType: result.mimeType });

      // Add to history
      const newHistoryItem: HistoryItem = {
        person: personImage.previewUrl,
        clothing: clothingImage.previewUrl,
        result: resultUrl,
      };
      setHistory(prev => [newHistoryItem, ...prev]);
      setView('result');

    } catch (e: any) {
      setError(e.message || t('errorUnexpected'));
      setView('tryOn');
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  };

  const handleGetSuggestions = async () => {
    const finalPrompt = stylistPrompt === 'custom' ? customStylistPrompt : stylistPrompt;
    if (!finalPrompt) {
        setError(t('errorSelectStyle'));
        return;
    }
    setLoadingText(t('gettingSuggestions'));
    setError(null);
    setSuggestions([]);
    setSuggestionImages({});
    
    let isRequestLoading = true;
    setTimeout(() => {
      if(isRequestLoading) setIsLoading(true);
    }, 200);

    try {
        const results = await getClothingSuggestions(finalPrompt, language, preferredColors);
        setSuggestions(results);
        
        setLoadingText(t('generatingImageGallery'));
        const imagePromises: Promise<void>[] = [];
        
        results.forEach((suggestion) => {
            setSuggestionImages(prev => ({...prev, [suggestion.name]: 'loading'}));

            const promise = generateClothingImage(suggestion.description, styleTheme).then(imageResult => {
                const imageUrl = `data:${imageResult.mimeType};base64,${imageResult.data}`;
                const imageFile = dataURLtoFile(imageUrl, `${suggestion.name.replace(/\s+/g, '-')}.png`);
                if(imageFile) {
                    setSuggestionImages(prev => ({
                        ...prev,
                        [suggestion.name]: { url: imageUrl, mimeType: imageResult.mimeType, file: imageFile }
                    }));
                }
            }).catch(error => {
                console.error(`Failed to generate image for ${suggestion.name}`, error);
                 setSuggestionImages(prev => {
                    const newState = {...prev};
                    delete newState[suggestion.name];
                    return newState;
                });
            });
            imagePromises.push(promise);
        });

        await Promise.all(imagePromises);

    } catch (e: any) {
        setError(e.message || t('errorUnexpected'));
    } finally {
        isRequestLoading = false;
        setIsLoading(false);
        setLoadingText('');
    }
  };

  const handleUseSuggestionImage = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    setClothingImage({ file, previewUrl });
    setError(null);
  };
  
  const handleShare = async () => {
    if (!generatedImage?.url || !navigator.share) return;
  
    try {
      const file = dataURLtoFile(generatedImage.url, 'tryon-result.png');
      if (!file) {
        throw new Error(t('errorCreateFile'));
      }
  
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('shareTitle'),
          text: t('shareText'),
        });
      } else {
        throw new Error(t('errorShareSupport'));
      }
    } catch (e: any) {
      console.error('Share failed:', e);
      setError(e.message || t('errorShareGeneric'));
    }
  };

  const handleSaveSession = () => {
    if (!personImage || !clothingImage) {
      setError(t('errorNeedBothImages'));
      return;
    }
    const session: SavedSession = {
      personImage: personImage.previewUrl,
      clothingImage: clothingImage.previewUrl,
      removeBgEnabled,
      styleTheme
    };
    try {
      localStorage.setItem('trayonSavedSession', JSON.stringify(session));
      setSavedSession(session);
      alert(t('sessionSaved'));
    } catch (e) {
      setError(t('errorSaveSession'));
    }
  };

  const handleLoadSession = () => {
    if (savedSession) {
      const personFile = dataURLtoFile(savedSession.personImage, 'person.png');
      const clothingFile = dataURLtoFile(savedSession.clothingImage, 'clothing.png');
      if (personFile) {
        setPersonImage({ file: personFile, previewUrl: savedSession.personImage });
      }
      if (clothingFile) {
        setClothingImage({ file: clothingFile, previewUrl: savedSession.clothingImage });
      }
      setRemoveBgEnabled(savedSession.removeBgEnabled);
      setStyleTheme(savedSession.styleTheme);
      setView('tryOn');
    }
  };

  const handleStartNew = () => {
    setPersonImage(null);
    setClothingImage(null);
    setGeneratedImage(null);
    setError(null);
    setStyleTheme('Photorealistic');
    setRemoveBgEnabled(true);
    setStylistPrompt('');
    setCustomStylistPrompt('');
    setPreferredColors('');
    setSuggestions([]);
    setSuggestionImages({});
    // Clear persisted images
    localStorage.removeItem('trayonPersonImage');
    localStorage.removeItem('trayonClothingImage');
  };

  const handleDeleteHistoryItem = (indexToDelete: number) => {
    if (window.confirm(t('deleteConfirmation'))) {
        setHistory(prev => prev.filter((_, index) => index !== indexToDelete));
    }
  };

  // --- Render Logic ---

  const renderContent = () => {
    switch (view) {
      case 'start':
        return <StartMenu 
          onStart={() => { handleStartNew(); setView('tryOn'); }} 
          onViewHistory={() => setView('history')}
          onLoadSession={handleLoadSession}
          hasHistory={history.length > 0}
          hasSavedSession={!!savedSession}
          t={t}
        />;
      
      case 'loading':
        return <LoadingView 
          personImage={personImage} 
          clothingImage={clothingImage} 
          loadingText={loadingText}
          t={t}
        />;

      case 'tryOn':
      case 'result': // Also render try on view in background for result
        return (
          <div className="w-full max-w-md mx-auto animate-fade-in px-4">
             <button onClick={() => setView('start')} className="text-brand-subtle font-semibold hover:text-brand-text transition-colors flex items-center mb-6 group">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                {t('backToMenu')}
             </button>
  
            <div className="space-y-10">
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-brand-text text-left">{t('yourPhoto')}</h2>
                    <ImageUploader 
                        id="person"
                        image={personImage}
                        onImageChange={handleImageChange(setPersonImage)}
                        t={t}
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-full h-full p-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
                    />
                    <div className="flex items-center justify-center p-2 rounded-lg">
                         <label htmlFor="remove-bg-toggle" className="text-brand-text font-medium mr-3">{t('removeBackground')}</label>
                         <button
                           id="remove-bg-toggle"
                           onClick={() => setRemoveBgEnabled(!removeBgEnabled)}
                           className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${removeBgEnabled ? 'bg-brand-primary' : 'bg-brand-stroke'}`}
                           aria-checked={removeBgEnabled}
                           role="switch"
                         >
                           <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${removeBgEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                         </button>
                     </div>
                </div>
  
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-brand-text text-left">{t('clothingItem')}</h2>
                    <ImageUploader 
                        id="clothing"
                        image={clothingImage}
                        onImageChange={handleImageChange(setClothingImage)}
                        t={t}
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="w-full h-full p-2" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" /></svg>}
                    />
                </div>
  
                <div className="flex items-center space-x-4">
                  <hr className="flex-grow border-brand-stroke"/>
                  <span className="text-brand-subtle font-semibold">{t('or')}</span>
                  <hr className="flex-grow border-brand-stroke"/>
                </div>
  
                <div className="border border-brand-stroke rounded-xl p-4 space-y-4 bg-brand-surface">
                  <h3 className="text-lg font-semibold text-brand-text text-center">{t('aiStylist')}</h3>
                  <select
                      value={stylistPrompt}
                      onChange={(e) => setStylistPrompt(e.target.value)}
                      className="w-full bg-brand-bg border border-brand-stroke rounded-lg py-2 px-3 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary"
                  >
                      <option value="" disabled>{t('styleSelect')}</option>
                      <option value={t('styleCasualPrompt')}>{t('styleCasual')}</option>
                      <option value={t('styleElegantPrompt')}>{t('styleElegant')}</option>
                      <option value={t('styleOfficePrompt')}>{t('styleOffice')}</option>
                      <option value={t('styleBeachPrompt')}>{t('styleBeach')}</option>
                      <option value={t('styleWinterPrompt')}>{t('styleWinter')}</option>
                      <option value={t('styleSportyPrompt')}>{t('styleSporty')}</option>
                      <option value={t('styleBohoPrompt')}>{t('styleBoho')}</option>
                      <option value={t('styleStreetwearPrompt')}>{t('styleStreetwear')}</option>
                      <option value="custom">{t('styleCustom')}</option>
                  </select>
  
                  {stylistPrompt === 'custom' && (
                      <textarea
                          value={customStylistPrompt}
                          onChange={(e) => setCustomStylistPrompt(e.target.value)}
                          placeholder={t('styleCustomPlaceholder')}
                          className="w-full bg-brand-bg border border-brand-stroke rounded-lg py-2 px-3 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary animate-fade-in-fast"
                          rows={3}
                      />
                  )}
  
                  <div>
                      <label htmlFor="preferred-colors" className="block text-sm font-medium text-brand-text mb-1">{t('preferredColors')}</label>
                      <input
                          id="preferred-colors"
                          type="text"
                          value={preferredColors}
                          onChange={(e) => setPreferredColors(e.target.value)}
                          placeholder={t('preferredColorsPlaceholder')}
                          className="w-full bg-brand-bg border border-brand-stroke rounded-lg py-2 px-3 text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary"
                      />
                  </div>
  
                  <button 
                      onClick={handleGetSuggestions} 
                      disabled={isLoading || (!stylistPrompt || (stylistPrompt === 'custom' && !customStylistPrompt))}
                      className="w-full bg-brand-surface text-brand-text font-bold py-2 px-4 rounded-lg shadow-sm transition-all duration-300 ease-in-out border border-brand-stroke/80 hover:enabled:bg-brand-stroke/20 focus:outline-none focus:ring-2 focus:ring-brand-stroke focus:ring-opacity-75 disabled:bg-brand-surface/50 disabled:text-brand-subtle/50 disabled:cursor-not-allowed flex items-center justify-center"
                  >
                      {loadingText === t('gettingSuggestions') ? <Spinner inline /> : t('getSuggestions')}
                  </button>
                </div>
                
                {suggestions.length > 0 && (
                   <div className="space-y-4 animate-fade-in">
                      <h3 className="text-lg font-semibold text-brand-text text-center">{t('suggestionTitle')}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                         {suggestions.map((suggestion) => (
                              <div key={suggestion.name} className="bg-brand-surface rounded-xl border border-brand-stroke/50 shadow-sm overflow-hidden flex flex-col">
                                <div 
                                  className={`w-full h-40 bg-brand-bg flex items-center justify-center relative group cursor-pointer ${suggestionImages[suggestion.name] === 'loading' ? 'animate-pulse' : ''}`}
                                  onClick={() => {
                                    const imageInfo = suggestionImages[suggestion.name];
                                    if (imageInfo && imageInfo !== 'loading') {
                                      handleUseSuggestionImage(imageInfo.file);
                                    }
                                  }}
                                >
                                  {suggestionImages[suggestion.name] === 'loading' && <Spinner />}
                                  {suggestionImages[suggestion.name] && suggestionImages[suggestion.name] !== 'loading' && (
                                      <>
                                          <img 
                                              src={(suggestionImages[suggestion.name] as any).url} 
                                              alt={suggestion.name} 
                                              className="w-full h-full object-contain"
                                          />
                                          <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                              <div className="text-center">
                                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                  </svg>
                                                  <p className="font-semibold mt-1 text-sm">{t('selectItem')}</p>
                                              </div>
                                          </div>
                                      </>
                                  )}
                                </div>
                                <div className="p-3 flex-grow">
                                    <h4 className="font-semibold text-brand-text text-sm">{suggestion.name}</h4>
                                    <p className="text-xs text-brand-subtle mt-1">{suggestion.description}</p>
                                </div>
                              </div>
                          ))}
                      </div>
                  </div>
                )}
  
                <div className="space-y-4">
                    <h2 className="text-xl font-bold text-brand-text text-center">{t('chooseStyleTheme')}</h2>
                    <div className="flex flex-col items-start w-full space-y-3">
                        {(['Photorealistic', 'Magazine Cover', 'Artistic'] as StyleTheme[]).map(theme => (
                            <label key={theme} className="flex items-center space-x-3 cursor-pointer w-full">
                                <input
                                    type="radio"
                                    name="styleTheme"
                                    value={theme}
                                    checked={styleTheme === theme}
                                    onChange={() => setStyleTheme(theme)}
                                    className="h-5 w-5 text-brand-primary border-brand-stroke focus:ring-2 focus:ring-brand-primary/50"
                                />
                                <span className="text-brand-text font-medium">{t(theme.toLowerCase().replace(' ', '') as TranslationKey)}</span>
                            </label>
                        ))}
                    </div>
                </div>
                
                {error && <p className="text-red-500 text-center">{error}</p>}
  
                <div className="space-y-4 pt-4">
                    <button 
                      onClick={handleTryOn} 
                      disabled={!personImage || !clothingImage}
                      className="w-full text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all duration-300 ease-in-out bg-gradient-to-r from-brand-primary to-brand-secondary hover:enabled:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50 disabled:bg-gradient-to-r disabled:from-brand-primary/50 disabled:to-brand-secondary/50 disabled:cursor-not-allowed"
                    >
                      {t('tryItOn')}
                    </button>
                    <button 
                      onClick={handleSaveSession}
                      disabled={!personImage || !clothingImage}
                      className="w-full bg-brand-surface text-brand-text font-bold py-3 px-4 rounded-xl shadow-sm transition-all duration-300 ease-in-out border border-brand-stroke/50 hover:enabled:bg-brand-stroke/20 focus:outline-none focus:ring-2 focus:ring-brand-stroke focus:ring-opacity-75 disabled:bg-brand-surface/50 disabled:text-brand-subtle/50 disabled:cursor-not-allowed"
                    >
                      {t('saveForLater')}
                    </button>
                </div>
            </div>
          </div>
        );

      case 'history':
        return (
          <div className="w-full max-w-4xl mx-auto animate-fade-in px-4">
              <button onClick={() => setView('start')} className="text-brand-subtle font-semibold hover:text-brand-text transition-colors flex items-center mb-6">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                 </svg>
                {t('backToMenu')}
              </button>
              <h2 className="text-3xl font-semibold text-brand-text text-center mb-8">{t('yourHistory')}</h2>
              {history.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {history.map((item, index) => (
                      <div key={index} className="group relative aspect-w-9 aspect-h-16 rounded-xl overflow-hidden shadow-lg cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:z-10 bg-brand-surface/50 backdrop-blur-sm hover:bg-brand-surface/70" onClick={() => setSelectedHistoryItem(item)}>
                        <img src={item.result} alt={t('generatedTryOn')} className="object-cover w-full h-full" />
                         <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                         <button 
                            onClick={(e) => { e.stopPropagation(); handleDeleteHistoryItem(index); }} 
                            className="absolute top-2 right-2 bg-black/50 text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 scale-90 group-hover:scale-100"
                            aria-label={t('deleteHistoryItem')}
                            title={t('deleteItem')}
                         >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                         </button>
                      </div>
                  ))}
                </div>
              ) : (
                <p className="text-brand-subtle text-center">{t('noHistory')}</p>
              )}
          </div>
        );

      default:
        return null;
    }
  };

  const ResultView: React.FC = () => (
    <div className="w-full max-w-2xl mx-auto animate-fade-in px-4 space-y-6">
      <h2 className="text-3xl font-semibold text-brand-text text-center">{t('yourVirtualTryOn')}</h2>
      
      <div className="w-full aspect-[9/16] max-w-sm mx-auto rounded-xl shadow-2xl overflow-hidden">
        {generatedImage && <ZoomableImage src={generatedImage.url} alt="Generated try-on result" />}
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button 
          onClick={() => { handleStartNew(); setView('tryOn'); }}
          className="w-full bg-brand-surface text-brand-text font-bold py-3 px-4 rounded-xl shadow-sm transition-all duration-300 ease-in-out border border-brand-stroke/50 hover:enabled:bg-brand-stroke/20 focus:outline-none focus:ring-2 focus:ring-brand-stroke focus:ring-opacity-75"
        >
          {t('startNew')}
        </button>
        {navigator.share && (
            <button
              onClick={handleShare}
              className="w-full text-white font-bold py-3 px-4 rounded-xl shadow-md transition-all duration-300 ease-in-out bg-gradient-to-r from-brand-primary to-brand-secondary hover:enabled:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50"
            >
              {t('share')}
            </button>
        )}
      </div>

       <div className="pt-8">
            <h3 className="text-xl font-semibold text-brand-text text-center mb-4">{t('yourHistory')}</h3>
            {history.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
                    {history.map((item, index) => (
                         <div key={index} className="group relative aspect-w-9 aspect-h-16 rounded-xl overflow-hidden shadow-lg cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-105 hover:z-10 bg-brand-surface/50 backdrop-blur-sm hover:bg-brand-surface/70" onClick={() => setSelectedHistoryItem(item)}>
                            <img src={item.result} alt={t('generatedTryOn')} className="object-cover w-full h-full" />
                             <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                             <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteHistoryItem(index); }} 
                                className="absolute top-2 right-2 bg-black/50 text-white w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 scale-90 group-hover:scale-100"
                                aria-label={t('deleteHistoryItem')}
                                title={t('deleteItem')}
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                             </button>
                          </div>
                    ))}
                </div>
            ) : (
                <p className="text-brand-subtle text-center">{t('noHistory')}</p>
            )}
        </div>
    </div>
  )


  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans flex flex-col">
      <Header t={t} theme={theme} setTheme={setTheme} language={language} setLanguage={setLanguage}/>
      <main className="flex-grow flex flex-col items-center justify-start p-4">
        {view !== 'result' ? renderContent() : <ResultView />}
      </main>
      {selectedHistoryItem && (
        <ImageModal item={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} t={t} />
      )}
    </div>
  );
};

export default App;