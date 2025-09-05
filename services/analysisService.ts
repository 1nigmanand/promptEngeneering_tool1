import { AnalysisResult, Challenge, User } from '../types';
import { getAi, getLocalImageAsBlobUrl } from './ApiService';
import { Type } from '@google/genai';


// --- Image Stitching ---

async function stitchImages(
  targetImageUrl: string,
  generatedImageBase64: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  const targetImage = new Image();
  const generatedImage = new Image();
  targetImage.crossOrigin = 'anonymous';

  const blobUrl = await getLocalImageAsBlobUrl(targetImageUrl);

  const loadTargetPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    targetImage.onload = () => resolve(targetImage);
    targetImage.onerror = () => {
      reject(new Error(`Failed to load target image: ${targetImageUrl}`));
    };
    targetImage.src = blobUrl;
  });

  const loadGeneratedPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    generatedImage.onload = () => resolve(generatedImage);
    generatedImage.onerror = () => {
      reject(new Error('Failed to load generated image from base64'));
    };
    
    // generatedImageBase64 is raw base64 string, add data URL prefix
    generatedImage.src = `data:image/jpeg;base64,${generatedImageBase64}`;
  });

  const [img1, img2] = await Promise.all([loadTargetPromise, loadGeneratedPromise]);

  const BORDER_WIDTH = 3;
  const canvasWidth = img1.width + BORDER_WIDTH + img2.width;
  const canvasHeight = Math.max(img1.height, img2.height);

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  // Fill the background, this will also serve as the border color
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(img1, 0, 0);
  ctx.drawImage(img2, img1.width + BORDER_WIDTH, 0);

  if (blobUrl.startsWith('blob:')) {
    URL.revokeObjectURL(blobUrl);
  }

  // Return base64 string without the data URL prefix
  const resultBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
  return resultBase64;
}


// --- Analysis Service Logic ---

export const analyzeImages = async (
  user: User,
  challenge: Challenge,
  generatedImageBase64: string,
  userPrompt: string,
): Promise<AnalysisResult> => {
  try {
    const gemini = getAi();

    const getUserName = (email: string): string => {
      const namePart = email.split('@')[0];
      // Capitalize first letter of the first part (e.g., 'john.doe' -> 'John')
      return namePart.split('.')[0].charAt(0).toUpperCase() + namePart.split('.')[0].slice(1);
    };
    const userName = getUserName(user.email);

    const systemPrompt = `You are an expert image analysis AI for a prompt engineering learning tool. Your feedback tone should be quirky and vague, in simple and clear Indian English. Keep technical terms in pure English.
    A student named ${userName} is trying to generate an image to match a target image for a prompt engineering challenge.
    Analyze the provided image which contains two images side-by-side. The image on the LEFT is the "target image", and the image on the RIGHT is the student's generated image.

    Provide:
    1. A 'similarityScore' from 0-100.
    2. A 'feedback' JSON array of up to 3 strings with prompt improvement suggestions.

    Respond ONLY with a JSON object matching the provided schema.`;

        const userTurnPrompt = ` Challenge Name: "${challenge.name}".
    The goal is: "${challenge.description}".
    The student's prompt was: "${userPrompt}".
`;

    const stitchedImageBase64 = await stitchImages(challenge.imageUrl, generatedImageBase64);
    const stitchedImagePart = {
      inlineData: {
        data: stitchedImageBase64,
        mimeType: "image/jpeg",
      },
    };

     const responseSchema = {
        type: Type.OBJECT,
        properties: {
            similarityScore: {
                type: Type.NUMBER,
                description: 'A similarity score from 0-100 comparing the generated image to the target image.',
            },
            feedback: {
                type: Type.ARRAY,
                items: {
                    type: Type.STRING,
                },
                description: 'An array of up to 3 strings with prompt improvement suggestions.',
            },
        },
        required: ['similarityScore', 'feedback'],
    };

    const response = await gemini.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { text: userTurnPrompt },
                stitchedImagePart,
            ]
        },
        config: {
            systemInstruction: systemPrompt,
            responseMimeType: "application/json",
            responseSchema: responseSchema,
        }
    });

    const jsonText = response.text.trim();
    const result: AnalysisResult = JSON.parse(jsonText);
    
    if (!result || typeof result.similarityScore !== 'number' || !Array.isArray(result.feedback)) {
        throw new Error("Model returned malformed analysis data.");
    }
    
    return result;

  } catch (error) {
    console.error("Failed to get analysis:", error);
    if (error instanceof Error) {
        throw new Error(`Analysis failed: ${error.message}`);
    }
    throw new Error("An unknown error occurred during analysis.");
  }
};