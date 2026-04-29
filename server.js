import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 🧠 MEMORY STORAGE (No MongoDB needed!)
let users = {}; // { userId: { genres: [], history: [] } }

/* =========================
   🤖 GROQ AI
========================= */
if (!process.env.GROQ_API_KEY) {
  console.error("❌ GROQ_API_KEY missing in .env!");
  process.exit(1);
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* =========================
   HEALTH CHECK
========================= */
app.get('/', (req, res) => {
  res.json({ 
    status: '🚀 BookAI Server Running!',
    users: Object.keys(users).length,
    timestamp: new Date().toISOString()
  });
});

/* =========================
   DEBUG ROUTE (CHECK USERS)
========================= */
app.get('/check', (req, res) => {
  const safeUsers = Object.entries(users).reduce((acc, [userId, data]) => {
    acc[userId] = {
      genres: data.genres,
      historyCount: data.history.length
    };
    return acc;
  }, {});
  res.json(safeUsers);
});

/* =========================
   CHAT ROUTE - FULLY WORKING
========================= */
app.post('/chat', async (req, res) => {
  try {
    const { message, userId = "defaultUser" } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ 
        reply: "Please send a message! 📝" 
      });
    }

    console.log("📥", { userId, message: message.slice(0, 50) + '...' });

    // 🧠 Get or create user
    if (!users[userId]) {
      users[userId] = {
        genres: [],
        history: []
      };
    }

    const user = users[userId];
    const recentHistory = user.history.slice(-5).join('\n');

    /* 🤖 AI PROMPT */
    const systemPrompt = `You are BookAI - expert book identifier.

User history: ${recentHistory}

Rules:
- User describes story → Guess EXACT book title
- Respond ONLY in this format:

📖 [BOOK TITLE]
[One line description]

Examples:
📖 Harry Potter and the Philosopher's Stone
A young wizard discovers his powers and fights Voldemort.

Keep it short and accurate!`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ],
      temperature: 0.7,
      max_tokens: 250
    });

    const reply = response.choices[0].message.content?.trim() || 
                  "Sorry, I couldn't identify that book! 📚";

    // 💾 Save history (keep last 20)
    user.history.push(message);
    if (user.history.length > 20) {
      user.history = user.history.slice(-20);
    }

    console.log("💬 Reply:", reply.slice(0, 100) + '...');

    res.json({ 
      reply, 
      userId,
      historyCount: user.history.length 
    });

  } catch (err) {
    console.error("❌ ERROR:", err.message);
    res.status(500).json({ 
      reply: "Oops! Server hiccup. Try again! 😅" 
    });
  }
});

/* =========================
   CLEAR USER HISTORY
========================= */
app.delete('/user/:userId/history', (req, res) => {
  const { userId } = req.params;
  if (users[userId]) {
    users[userId].history = [];
    res.json({ message: `History cleared for ${userId}` });
  } else {
    res.status(404).json({ error: 'User not found' });
  }
});

/* =========================
   USER INFO
========================= */
app.get('/user/:userId', (req, res) => {
  const { userId } = req.params;
  const user = users[userId];
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({
    userId,
    genres: user.genres,
    historyCount: user.history.length
  });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 BookAI running: http://localhost:${PORT}`);
  console.log(`📊 Health: http://localhost:${PORT}/`);
  console.log(`🔍 Users: http://localhost:${PORT}/check`);
  console.log(`💬 Test POST: http://localhost:${PORT}/chat`);
});