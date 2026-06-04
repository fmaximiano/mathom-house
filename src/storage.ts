import { RiddleItem, ProjectItem, MathomItem, SecretSpot } from "./types";
import { INITIAL_RIDDLES, INITIAL_PROJECTS, INITIAL_MATHOMS, TELESCOPE_SECRETS } from "./data";

const KEYS = {
  riddles: "mathom_house_riddles",
  projects: "mathom_house_projects",
  mathoms: "mathom_house_cabinet",
  secrets: "mathom_house_secrets",
  adminPin: "mathom_house_admin_pin",
};

function load<T>(key: string, fallback: T[]): T[] {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return JSON.parse(stored);
  } catch {}
  return fallback;
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function getRiddles(): RiddleItem[] {
  return load(KEYS.riddles, INITIAL_RIDDLES);
}

export function saveRiddles(riddles: RiddleItem[]) {
  save(KEYS.riddles, riddles);
}

export function getProjects(): ProjectItem[] {
  return load(KEYS.projects, INITIAL_PROJECTS);
}

export function saveProjects(projects: ProjectItem[]) {
  save(KEYS.projects, projects);
}

export function getMathoms(): MathomItem[] {
  return load(KEYS.mathoms, INITIAL_MATHOMS);
}

export function saveMathoms(mathoms: MathomItem[]) {
  save(KEYS.mathoms, mathoms);
}

export function getSecrets(): SecretSpot[] {
  return load(KEYS.secrets, TELESCOPE_SECRETS);
}

export function saveSecrets(secrets: SecretSpot[]) {
  save(KEYS.secrets, secrets);
}

export function getAdminPin(): string | null {
  return localStorage.getItem(KEYS.adminPin);
}

export function setAdminPin(pin: string) {
  localStorage.setItem(KEYS.adminPin, pin);
}

export function getTodaysRiddle(riddles: RiddleItem[]): RiddleItem | null {
  if (riddles.length === 0) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return riddles[dayOfYear % riddles.length];
}
