import React, { useState, useCallback } from 'react';
import { virtualTryOn } from './services/geminiService';
import type { UploadedImage } from './types';

// Helper function to convert a File object to a base64 string
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // result is "data:mime/type;base64,..."
      // we only want the part after the comma
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

// --- Sub-components defined outside the main App component to prevent re-rendering issues ---

const Header: React.FC = () => (
  <header className="w-full text-center p-4">
    <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-brand-primary to-brand-secondary tracking-tight">
      Trayon
    </h1>
    <p className="text-brand-subtle mt-1">Virtual Try-On with AI</p>
  </header>
);

interface ImageUploaderProps {
  id: string;
  label: string;
  image: UploadedImage | null;
  onImageChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  icon: React.ReactNode;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ id, label, image, onImageChange, icon }) => (
  <div className="w-full">
    <label htmlFor={id} className="block text-lg font-medium text-brand-text mb-2 text-center">{label}</label>
    <div className="mt-1 flex justify-center">
      <label
        htmlFor={id}
        className="relative flex justify-center items-center w-44 h-56 md:w-52 md:h-72 border-2 border-brand-stroke border-dashed rounded-xl cursor-pointer bg-brand-surface hover:border-brand-primary transition-all duration-300 shadow-sm"
      >
        {image ? (
          <img src={image.previewUrl} alt="Preview" className="object-cover w-full h-full rounded-xl" />
        ) : (
          <div className="text-center text-brand-subtle">
            {icon}
            <p className="mt-2 text-sm font-medium">Upload Photo</p>
          </div>
        )}
        <input id={id} name={id} type="file" className="sr-only" accept="image/*" onChange={onImageChange} />
      </label>
    </div>
  </div>
);

const Spinner: React.FC = () => (
    <div className="flex flex-col items-center justify-center space-y-4">
        <svg className="animate-spin h-10 w-10 text-brand-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-brand-subtle text-lg font-medium">AI is working its magic...</p>
        <p className="text-brand-subtle text-sm max-w-xs text-center">This can take a moment. Please be patient while we create your new look!</p>
    </div>
);


// --- Main App Component ---

const App: React.FC = () => {
  const [personImage, setPersonImage] = useState<UploadedImage | null>(null);
  const [clothingImage, setClothingImage] = useState<UploadedImage | null>(null);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<UploadedImage | null>>
  ) => {
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0];
      setter({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
  };

  const handleTryOn = useCallback(async () => {
    if (!personImage || !clothingImage) {
      setError("Please upload both a person and a clothing item.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setGeneratedImage(null);

    try {
      const personImageBase64 = await fileToBase64(personImage.file);
      const clothingImageBase64 = await fileToBase64(clothingImage.file);

      const result = await virtualTryOn(
        personImageBase64,
        personImage.file.type,
        clothingImageBase64,
        clothingImage.file.type
      );
      
      setGeneratedImage(`data:${result.mimeType};base64,${result.data}`);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "An unexpected error occurred.");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  }, [personImage, clothingImage]);
  
  const handleReset = () => {
    setPersonImage(null);
    setClothingImage(null);
    setGeneratedImage(null);
    setError(null);
    setIsLoading(false);
  };

  const isButtonDisabled = !personImage || !clothingImage || isLoading;

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans flex flex-col items-center p-4">
      <div className="w-full max-w-4xl mx-auto flex flex-col items-center">
        <Header />

        <main className="w-full flex-grow flex flex-col items-center justify-start mt-6">
          {!generatedImage && !isLoading && (
            <div className="w-full flex flex-col md:flex-row items-start justify-center gap-8 md:gap-16">
              <ImageUploader
                id="person-upload"
                label="Your Photo"
                image={personImage}
                onImageChange={(e) => handleImageChange(e, setPersonImage)}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-brand-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" /></svg>}
              />
              <ImageUploader
                id="clothing-upload"
                label="Clothing Item"
                image={clothingImage}
                onImageChange={(e) => handleImageChange(e, setClothingImage)}
                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-brand-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12M6 6v12m0-12L18 18M6 6l12 12" /></svg>}
              />
            </div>
          )}

          <div className="mt-8 w-full flex flex-col items-center space-y-6">
            {isLoading && <Spinner />}
            
            {error && <div className="text-red-700 bg-red-100 border border-red-300 p-3 rounded-lg text-center font-medium">{error}</div>}
            
            {generatedImage && (
              <div className="flex flex-col items-center space-y-4 animate-fade-in">
                 <h2 className="text-2xl font-semibold text-brand-text">Your Virtual Try-On!</h2>
                 <div className="p-2 bg-brand-surface rounded-xl shadow-xl">
                    <img src={generatedImage} alt="Generated try-on" className="max-w-xs md:max-w-md rounded-lg" />
                 </div>
              </div>
            )}
            
            <div className="w-full max-w-sm pt-4">
             {!generatedImage ? (
                <button
                    onClick={handleTryOn}
                    disabled={isButtonDisabled}
                    className="w-full text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed bg-gradient-to-r from-brand-primary to-brand-secondary hover:enabled:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand-primary focus:ring-opacity-50"
                >
                    {isLoading ? 'Generating...' : 'Try It On!'}
                </button>
             ) : (
                <button
                    onClick={handleReset}
                    className="w-full bg-gray-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-300 ease-in-out hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
                >
                    Start New Try-On
                </button>
             )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};

export default App;