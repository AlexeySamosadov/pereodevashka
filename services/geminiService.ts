import { GoogleGenAI, Modality, Type } from "@google/genai";

const fileToGenerativePart = (base64Data: string, mimeType: string) => {
  return {
    inlineData: {
      data: base64Data,
      mimeType,
    },
  };
};

export const getClothingSuggestions = async (prompt: string, lang: 'en' | 'ru'): Promise<{ name: string; description: string }[]> => {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable is not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const model = 'gemini-2.5-pro';

    const systemInstruction = lang === 'ru'
        ? "Ты — креативный и знающий модный стилист. На основе запроса пользователя предложи три различных и стильных варианта одежды. Для каждого предложения укажи краткое название и подробное, привлекательное описание, подходящее для создания изображения. Отвечай на русском языке."
        : "You are a creative and knowledgeable fashion stylist. Based on the user's request, provide three distinct and stylish clothing item suggestions. For each suggestion, provide a concise name and a detailed, appealing description suitable for generating an image. Respond in English.";

    try {
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        suggestions: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    name: { type: Type.STRING },
                                    description: { type: Type.STRING },
                                },
                                required: ['name', 'description'],
                            },
                        },
                    },
                    required: ['suggestions'],
                },
            },
        });

        const jsonResponse = JSON.parse(response.text);
        if (jsonResponse.suggestions && Array.isArray(jsonResponse.suggestions)) {
            return jsonResponse.suggestions;
        } else {
            throw new Error("AI response did not contain valid suggestions.");
        }

    } catch (error) {
        console.error("Error calling Gemini API for clothing suggestions:", error);
        throw new Error("Failed to get clothing suggestions. Please check the console.");
    }
};

export const generateClothingImage = async (
  description: string
): Promise<{ data: string; mimeType: string }> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.5-flash-image';
  
  const textPart = {
      text: `Generate a high-resolution, photorealistic image of a single clothing item: "${description}". The item should be displayed flat or on a mannequin against a pure white background. There should be no shadows or other objects in the image. This image is for a virtual try-on application.`
  };
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts: [textPart] },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const firstCandidate = response.candidates?.[0];
    const imagePart = firstCandidate?.content?.parts?.find(part => part.inlineData);

    if (imagePart && imagePart.inlineData) {
      return {
        data: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
      };
    } else {
      const feedback = response.promptFeedback;
      if (feedback?.blockReason) {
        throw new Error(`Clothing image generation was blocked due to: ${feedback.blockReason}`);
      }
      throw new Error("No image was generated for the clothing item.");
    }
  } catch (error) {
    console.error("Error calling Gemini API for clothing image generation:", error);
    throw new Error("Failed to generate clothing image. Please check the console.");
  }
};


export const removeBackground = async (
  imageBase64: string,
  imageMimeType: string
): Promise<{ data: string; mimeType: string }> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  const model = 'gemini-2.5-flash-image';
  
  const textPart = {
      text: "You are an expert image editor. Your task is to accurately remove the background from the provided image, leaving only the main person. The output image must have a transparent background."
  };

  const imagePart = fileToGenerativePart(imageBase64, imageMimeType);
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
            imagePart,
            textPart,
        ],
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });

    const firstCandidate = response.candidates?.[0];
    const generatedImagePart = firstCandidate?.content?.parts?.find(part => part.inlineData);

    if (generatedImagePart && generatedImagePart.inlineData) {
      return {
        data: generatedImagePart.inlineData.data,
        mimeType: generatedImagePart.inlineData.mimeType,
      };
    } else {
      const feedback = response.promptFeedback;
      if (feedback?.blockReason) {
        throw new Error(`Background removal was blocked due to: ${feedback.blockReason}`);
      }
      throw new Error("No image was generated during background removal.");
    }

  } catch (error) {
    console.error("Error calling Gemini API for background removal:", error);
    throw new Error("Failed to remove background. Please check the console for more details.");
  }
};


export const virtualTryOn = async (
  personImageBase64: string,
  personImageMimeType: string,
  clothingImageBase64: string,
  clothingImageMimeType: string,
  styleTheme: 'Photorealistic' | 'Magazine Cover' | 'Artistic'
): Promise<{ data: string; mimeType: string }> => {
  if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set.");
  }
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = 'gemini-2.5-flash-image';
  
  let promptText = "You are an expert virtual stylist. Your task is to take the person from the first image and dress them in the outfit from the second image. The final image should look realistic, preserving the person's face, body pose, and the original background as much as possible. Only output the final generated image.";

  switch (styleTheme) {
      case 'Magazine Cover':
          promptText = "You are a creative director for a high-fashion magazine. Your task is to create a dramatic and stylish magazine cover shot. Take the person from the first image and dress them in the outfit from the second image. The final image should be composed like a professional magazine cover, with bold lighting and a captivating pose. Preserve the person's face. The background can be stylized to fit the theme. Only output the final generated image.";
          break;
      case 'Artistic':
          promptText = "You are a digital artist. Your task is to reinterpret the virtual try-on as a piece of art. Take the person from the first image and dress them in the outfit from the second image. The final image should be in a stylized, artistic manner (e.g., digital painting, watercolor effect, or graphic art style), while still being recognizable. Preserve the person's face. Only output the final generated image.";
          break;
  }

  const textPart = { text: promptText };
  const personImagePart = fileToGenerativePart(personImageBase64, personImageMimeType);
  const clothingImagePart = fileToGenerativePart(clothingImageBase64, clothingImageMimeType);
  
  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
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
      return {
        data: imagePart.inlineData.data,
        mimeType: imagePart.inlineData.mimeType,
      };
    } else {
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