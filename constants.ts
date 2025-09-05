
import { Challenge } from './types';

export const PASS_THRESHOLD = 75;

export const CHALLENGES: Challenge[] = [
  {
    id: 1,
    name: "Simple Shape",
    imageUrl: "challenges/challenge-1.png",
    description: "Generate a simple image of a single, centered object. Focus on the color and shape.",
  },
  {
    id: 2,
    name: "Object with Background",
    imageUrl: "challenges/challenge-2.png",
    description: "Describe an object and its immediate surroundings. Pay attention to textures and lighting.",
  },
  {
    id: 3,
    name: "Detailed Scene",
    imageUrl: "challenges/challenge-3.png",
    description: "Create a scene with multiple elements. Describe their relationships and the overall atmosphere.",
  },
  {
    id: 4,
    name: "Abstract Concept",
    imageUrl: "challenges/challenge-4.png",
    description: "Generate an image that represents a feeling or idea. Use metaphorical language.",
  },
  {
    id: 5,
    name: "Specific Art Style",
    imageUrl: "challenges/challenge-5.png",
    description: "Recreate an image in a specific artistic style, like 'impressionist painting' or 'cyberpunk art'.",
  },
  {
    id: 6,
    name: "Complex Composition",
    imageUrl: "challenges/challenge-6.png",
    description: "A final test. Describe a complex scene with intricate details, specific lighting, and a distinct mood.",
  },
];