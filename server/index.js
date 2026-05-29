import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
const port = process.env.PORT || 5174;

function buildEstimatePrompt(entry) {
  return `Analyze this meal entry and reply only with a JSON object containing calories, protein, carbs, and fat rounded to whole numbers. Do not add any prose.\n\nFood description: ${entry}\n\nExample response:\n{\n  "calories": 420,\n  "protein": 22,\n  "carbs": 35,\n  "fat": 18\n}`;
}

app.post('/api/claude/estimate', async (req, res) => {
  const { description } = req.body;
  if (!description) {
    return res.status(400).json({ error: 'Missing description for Claude estimate.' });
  }

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/complete',
      {
        model: 'claude-3.5-mini',
        prompt: `<s>\nHuman: ${buildEstimatePrompt(description)}\nAssistant:`,
        max_tokens_to_sample: 150,
        temperature: 0.2,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.CLAUDE_API_KEY,
        },
      }
    );

    const completion = response.data?.completion?.trim();
    return res.json({ completion });
  } catch (error) {
    console.error('Claude request failed:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Claude request failed. Check server logs and API key.' });
  }
});

app.listen(port, () => {
  console.log(`Claude proxy running on http://localhost:${port}`);
});
