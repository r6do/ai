import express from 'express';
import { opencode } from 'ai-sdk-provider-opencode-sdk';
import { generateText } from 'ai';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const app = express();
app.use(express.json());
app.use(express.static('public'));

const DB_FILE = path.resolve('./database.json');

// Encryption Settings (Uses an environment variable or a strong fallback key)
// In a real hosting environment (like Vercel/Render), set the ENCRYPTION_KEY variable.
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32); 
const IV_LENGTH = 12; // Standard for GCM

// Encrypt Function
function encryptText(text) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    
    // Combine iv, authTag, and encrypted data into a safe string structure
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

// Decrypt Function
function decryptText(encryptedData) {
    try {
        const [ivHex, authTagHex, encryptedHex] = encryptedData.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY), iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (e) {
        return "[Decryption Failure - Missing Private Key Data]";
    }
}

function readDB() {
    try {
        if (!fs.existsSync(DB_FILE)) return { users: [], chats: [] };
        const data = fs.readFileSync(DB_FILE, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { users: [], chats: [] };
    }
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// 1. Account Registration Endpoint (Using secure hashing)
app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

    const db = readDB();
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    // Passwords are securely hashed, never saved raw
    const hashedPassword = await bcrypt.hash(password, 10);
    db.users.push({ username, password: hashedPassword });
    writeDB(db);

    res.json({ success: true, message: 'Account created successfully!' });
});

// 2. Account Login Endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.username === username);

    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }

    res.json({ success: true, username });
});

// 3. Fetch User Chat History (Decrypting on the fly before sending to UI)
app.get('/api/chats', (req, res) => {
    const username = req.headers['x-user-session'];
    if (!username) return res.status(401).json({ error: 'Unauthorized' });

    const db = readDB();
    const userChats = db.chats.filter(c => c.username === username);
    
    // Decrypt the contents safely before sending them back to the user's web browser
    const decryptedChats = userChats.map(c => ({
        id: c.id,
        username: c.username,
        prompt: decryptText(c.prompt),
        result: decryptText(c.result),
        timestamp: c.timestamp
    }));

    res.json({ chats: decryptedChats });
});

// 4. Generate Code & Encrypt to File Storage
app.post('/api/generate-code', async (req, res) => {
    const { prompt } = req.body;
    const username = req.headers['x-user-session'];

    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    if (!username) return res.status(401).json({ error: 'Please log in' });

    try {
        const model = opencode('opencode/north-mini-code-free');

        const { text } = await generateText({
            model: model,
            prompt: `You are Free CodeAi, an elite programming intelligence. Provide only high-quality, fully commented scripts or code syntax for the user request below. Request: ${prompt}`,
        });

        const db = readDB();
        
        // Encrypt data entries completely before writing to database.json
        db.chats.push({
            id: Date.now().toString(),
            username,
            prompt: encryptText(prompt),
            result: encryptText(text),
            timestamp: new Date().toISOString()
        });
        writeDB(db);

        res.json({ result: text });
    } catch (error) {
        res.status(500).json({ error: 'AI generation error.' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Free CodeAi secure engine online at http://localhost:${PORT}`);
});