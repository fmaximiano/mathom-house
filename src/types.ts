export type RoomType = "door" | "wright" | "mathoms" | "world_rim";

export interface ProjectItem {
  id: string;
  title: string;
  description: string;
  category: "Automation" | "Web App" | "AI Experiment" | "Craft";
  tags: string[];
  link?: string;
}

export interface MathomItem {
  id: string;
  title: string;
  content: string;
  category: "Prompts" | "Lore" | "Articles" | "References";
  date: string;
  sourceUrl?: string;
  tags: string[];
}

export interface SecretSpot {
  id: string;
  name: string;
  description: string;
  coordinates: { x: number; y: number }; // Percentage position on panoramic window
  link?: string;
  revealText: string;
}
