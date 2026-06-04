import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { initSchema } from "./server/db";
import authRouter from "./server/auth";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

// Auth routes
app.use("/api/auth", authRouter);

// Lazy-loaded GoogleGenAI client to avoid crashes if the key is missing at load time
let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured in the environment.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// Creative assistants API route
app.post("/api/assistant", async (req, res) => {
  const { prompt, room, context } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "No prompt content provided." });
  }

  try {
    const ai = getAiClient();

    let systemInstruction = "";
    if (room === "wright") {
      systemInstruction = `You are the "Creative Workbench Automaton" of the Mathom House wright-room.
You are a cozy, warm, slightly whimsical, yet extraordinarily clever AI assistant that resides inside a wooden hobbit-style workbench.
You speak English, in a friendly, gentle tone. You love talking about hobbies, inventive mechanics, warm glowing lanterns, gadgets, code,
automation designs, and physical crafts (e.g., wooden birdhouses, beautiful garden lights, smart fireplace pipes, copper cogwheels, or simple web tools).
Help the user frame their idea or projects into some charming hobbit-modern automation or craft suggestions. Keep responses concise, warm, atmospheric, and highly creative. Avoid generic boring tech-corporate speak. Use comforting, poetic words like 'hearth', 'brass', 'gears', 'workshop', and 'embellish'.`;
    } else if (room === "mathoms") {
      systemInstruction = `You are the "Master of Mathoms" or the "Archivist Spirit" of Mathom House.
You reside inside the fireplace fireplace hearth and card-catalog files of the Mathoms archive.
You speak English with elegance, depth, and comforting wisdom. You love old texts, treasured notes, references, vintage logs, and warm philosophy.
When users ask you for quote inspiration, notes organization, or to catalog a new reference, write back in a cozy, poetic literary voice.
Keep your suggestions and responses atmospheric, elegant, and relatively short. Avoid robotic formatting. Speak of paper texture, cozy fires, ink, and peaceful memories.`;
    } else {
      systemInstruction = `You are a gentle spirit of Mathom House, speaking in a warm, welcoming, cozy English voice, inspired by comfortable country homes, crackling hearths, and soft starlight.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.8,
      },
    });

    res.json({ text: response.text });
  } catch (error: any) {
    console.error("Gemini API Error in backend:", error);
    res.status(500).json({
      error: "Could not fetch suggestions right now.",
      details: error.message || "An issue occurred while processing your request inside the comforting hearth of Mathom House."
    });
  }
});

// Vite middleware integrated into Express
async function setupVite() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

async function start() {
  try {
    await initSchema();
    console.log("[DB] Connected to Neon PostgreSQL.");
  } catch (err) {
    console.error("[DB] Schema init failed — auth features will be unavailable:", err);
  }

  await setupVite();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} with environment: ${process.env.NODE_ENV || "development"}`);
  });
}

start();
