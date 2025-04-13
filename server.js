require("dotenv").config();

console.log("🔍 .env Debug Output:");
console.log("PORT =", process.env.PORT);
console.log("MONGODB_URI =", process.env.MONGODB_URI ? "[Loaded ✅]" : "[Missing ❌]");
console.log("OPENAI_API_KEY =", process.env.OPENAI_API_KEY ? "[Loaded ✅]" : "[Missing ❌]");
console.log("REDIS_URL =", process.env.REDIS_URL ? "[Loaded ✅]" : "[Missing ❌]");

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mongoose = require("mongoose");
const { OpenAI } = require("openai");
const { createClient } = require("redis");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// ✅ OPENAI Init
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
console.log("✅ OpenAI initialized");

// ✅ MongoDB Init
console.log("🔌 Connecting to MongoDB at:", process.env.MONGODB_URI);
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log("📦 Connected to MongoDB");
}).catch((err) => {
  console.error("❌ MongoDB connection error:", err.message);
});

// ✅ Redis Init
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.connect().then(() => {
  console.log("⚡ Connected to Redis");
}).catch((err) => {
  console.error("❌ Redis connection error:", err.message);
});

// ✅ Mongo Schema
const playerLogSchema = new mongoose.Schema({
  playerId: String,
  prompt: String,
  reply: String,
  timestamp: { type: Date, default: Date.now }
});
const PlayerLog = mongoose.model("PlayerLog", playerLogSchema);

// ✅ HEALTH CHECK
app.get("/", (req, res) => {
  res.send("✅ AI Developer Backend is running");
});

// ✅ ChatBridge Route (ChatGPT-to-backend)
app.post("/chatbridge", async (req, res) => {
  const { token, type, payload } = req.body;

  if (token !== process.env.CHATGPT_SECRET) {
    return res.status(403).json({ error: "❌ Invalid token" });
  }

  console.log("📡 ChatBridge received:", { type, payload });

  return res.json({ status: "✅ ChatBridge connection successful", echo: { type, payload } });
});

// ✅ AI Core Route (Roblox ↔ ChatGPT)
app.post("/ai-process", async (req, res) => {
  const { prompt, playerId } = req.body;

  if (!prompt || !playerId) {
    return res.status(400).json({ error: "Prompt and playerId are required." });
  }

  const isFacilityLayout = prompt.toLowerCase().includes("layout");
  const cooldownKey = isFacilityLayout ? null : `cooldown:${playerId}`;

  if (cooldownKey) {
    const cooldown = await redisClient.get(cooldownKey);
    if (cooldown) {
      return res.status(429).json({ error: "⏳ You're on cooldown. Try again soon." });
    }
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful AI assistant for a Roblox game called Black Vault." },
        { role: "user", content: prompt }
      ],
    });

    const reply = response.choices[0].message.content;
    console.log(`🧠 AI Reply for ${playerId}:`, reply);

    await PlayerLog.create({ playerId, prompt, reply });

    if (cooldownKey) {
      await redisClient.set(cooldownKey, "true", { EX: 10 });
    }

    res.json({ reply });
  } catch (err) {
    console.error("❌ AI Developer Error:", err.message);
    res.status(500).json({ error: "Failed to contact AI Developer." });
  }
});

// ✅ START SERVER
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
