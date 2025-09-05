// Storage API Service for saving prompts and images
// Uses storage.ndfreetech.me API

// Access environment variable properly in Vite
const API_BASE_URL = (import.meta as any).env?.VITE_STORAGE_API_URL || 'https://storage.ndfreetech.me';

console.log('🔧 Storage API URL:', API_BASE_URL);
console.log('🔧 Environment variable:', (import.meta as any).env?.VITE_STORAGE_API_URL);

// Get user email (you can modify this based on your user system)
const getUserEmail = (): string => {
  // If you have user authentication, get email from there
  // For now, using localStorage or default
  return localStorage.getItem('userEmail') || 'user@example.com';
};

// Auto-save prompt and image after generation
export const autoSavePromptAndImage = async (prompt: string, imageUrl: string): Promise<any> => {
  try {
    const userEmail = getUserEmail();
    
    console.log('🔄 Auto-saving prompt and image...', { prompt: prompt.substring(0, 50) + '...', imageUrl });
    
    const response = await fetch(`${API_BASE_URL}/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        studentId: userEmail, // Using email as studentId
        prompt: prompt,
        imageFile: imageUrl
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Prompt and image saved automatically:', result);
    } else {
      console.error('❌ Failed to save:', result.message);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Auto-save error:', error);
    return { success: false, error: error.message };
  }
};

// Get saved prompts for current user
export const getUserSavedPrompts = async (): Promise<any> => {
  try {
    const userEmail = getUserEmail();
    const response = await fetch(`${API_BASE_URL}/images/${userEmail}`);
    const result = await response.json();
    
    console.log('📚 Retrieved saved prompts:', result);
    return result;
  } catch (error) {
    console.error('❌ Error fetching saved prompts:', error);
    return { success: false, error: error.message };
  }
};

// Get all saved data (admin function)
export const getAllSavedData = async (): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/images`);
    const result = await response.json();
    
    console.log('📊 Retrieved all saved data:', result);
    return result;
  } catch (error) {
    console.error('❌ Error fetching all data:', error);
    return { success: false, error: error.message };
  }
};

// Health check for storage API
export const checkStorageHealth = async (): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const result = await response.json();
    
    console.log('💚 Storage API health check:', result);
    return result;
  } catch (error) {
    console.error('❌ Storage API health check failed:', error);
    return { success: false, error: error.message };
  }
};

// Set user email (call this when user logs in or changes)
export const setUserEmail = (email: string): void => {
  localStorage.setItem('userEmail', email);
  console.log('👤 User email set:', email);
};

// Get current user email
export const getCurrentUserEmail = (): string => {
  return getUserEmail();
};
