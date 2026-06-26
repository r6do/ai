import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AI Chat Endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Call the cloud Gemini model
    const { text } = await generateText({
      model: google('gemini-2.5-flash'),
      prompt: message,
    });

    return res.json({ response: text });
  } catch (error) {
    console.error('AI Generation Error:', error);
    return res.status(500).json({ error: 'Failed to generate AI response' });
  }
});

// Fallback to serve index.html for frontend routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running securely on port ${PORT}`);
});
