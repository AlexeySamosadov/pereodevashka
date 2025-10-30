import { GoogleGenAI, Modality } from "@google/genai";

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

// FIX: Update function to return an object with data and mimeType for robust handling of different image formats.
export const virtualTryOn = async (
  personImageBase64: string,
  personImageMimeType: string,
  clothingImageBase64: string,
  clothingImageMimeType: string
): Promise<{ data: string; mimeType: string }> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const model = 'gemini-2.5-flash-image';
  
  const textPart = {
      text: "You are an expert virtual stylist. Your task is to take the person from the first image and dress them in the outfit from the second image. The final image should look realistic, preserving the person's face, body pose, and the original background as much as possible. Only output the final generated image."
  };

  const personImagePart = fileToGenerativePart(personImageBase64, personImageMimeType);
  const clothingImagePart = fileToGenerativePart(clothingImageBase64, clothingImageMimeType);
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        // FIX: Reordered parts to provide images before the text prompt, which is a best practice for multimodal models.
        parts: [
            personImagePart,
            clothingImagePart,
            textPart,
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const firstCandidate = response.candidates?.[0];
    const imagePart = firstCandidate?.content?.parts?.find(part => part.inlineData);

    if (imagePart && imagePart.inlineData) {
      // FIX: Return both image data and mime type.
      return {
        data: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
      };
    } else {
      // FIX: Add more specific error handling for blocked content.
      const feedback = response.promptFeedback;
      if (feedback?.blockReason) {
        throw new Error(`Image generation was blocked due to: ${feedback.blockReason}`);
      }
      throw new Error("No image was generated in the response.");
    }

  } catch (error) {
    console.error("Error calling Gemini API:", error);
    throw new Error("Failed to generate image. Please check the console for more details.");
  }
};
