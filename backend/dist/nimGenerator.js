"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateNimProblems = generateNimProblems;
const NIM_API_URL = process.env.NIM_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';
function extractBetween(text, startMarker, endMarker) {
    const startIdx = text.indexOf(startMarker);
    if (startIdx === -1)
        return '';
    const afterStart = text.slice(startIdx + startMarker.length);
    const endIdx = afterStart.indexOf(endMarker);
    if (endIdx === -1)
        return afterStart.trim();
    return afterStart.slice(0, endIdx).trim();
}
function parseGeneratedProblem(content) {
    const title = extractBetween(content, 'Title:', 'Content:');
    const problemContent = extractBetween(content, 'Content:', 'Answer:');
    const answer = extractBetween(content, 'Answer:', 'Tags:');
    const tagsRaw = extractBetween(content, 'Tags:', 'Difficulty:');
    const difficultyRaw = extractBetween(content, 'Difficulty:', '');
    if (!title || !problemContent || !answer)
        return null;
    const tags = tagsRaw
        .split(/[,،]/)
        .map(t => t.trim())
        .filter(Boolean);
    const difficulty = parseInt(difficultyRaw) || 75000;
    return { title, content: problemContent, answer, tags, difficulty };
}
async function callNim(apiKey, systemPrompt, userPrompt) {
    const response = await fetch(NIM_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'meta/llama-3.1-8b-instruct',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
            max_tokens: 4096,
        }),
    });
    if (!response.ok) {
        throw new Error(`NVIDIA NIM API error: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
}
async function verifyAnswer(apiKey, problemContent, expectedAnswer) {
    const systemPrompt = 'You are a math solver. Solve the given math problem and output only the numeric answer. Do not include any explanation or additional text.';
    const userPrompt = `Solve this math problem:\n${problemContent}`;
    try {
        const solved = await callNim(apiKey, systemPrompt, userPrompt);
        const cleanedSolved = solved.replace(/\s+/g, '').toLowerCase();
        const cleanedExpected = expectedAnswer.replace(/\s+/g, '').toLowerCase();
        return cleanedSolved === cleanedExpected;
    }
    catch {
        return false;
    }
}
async function generateNimProblems(apiKey, count = 5, category) {
    const tagsList = ['일차방정식', '이차방정식', '연립방정식', '부등식', '일차함수', '식의계산', '도형', '지수법칙', '인수분해'];
    let categoryInstruction = '';
    if (category && category.trim()) {
        categoryInstruction = `Focus on the following topic/category: ${category.trim()}\n`;
    }
    const systemPrompt = `You are a Korean math problem generator. Generate math problems in Korean.
Each problem must follow this exact format:

Title: [problem title in Korean]
Content: [problem with LaTeX math using $...$ or $$...$$]
Answer: [numeric answer only]
Tags: [tag1, tag2, ...]
Difficulty: [number between 50000 and 150000]

Available tags: ${tagsList.join(', ')}
Difficulty guidelines: 50000-80000 easy, 80000-110000 medium, 110000-150000 hard.
Ensure the answer is a single integer or simple fraction.
Content must use LaTeX delimiters $...$ for inline and $$...$$ for display math.`;
    const userPrompt = `${categoryInstruction}Generate ${count} different Korean math problems. Each with a unique topic.
For each problem, output the format exactly as specified.
Separate problems with --- on a new line.`;
    try {
        const generatedText = await callNim(apiKey, systemPrompt, userPrompt);
        const blocks = generatedText.split(/---/);
        const problems = [];
        for (const block of blocks) {
            const parsed = parseGeneratedProblem(block.trim());
            if (parsed) {
                problems.push(parsed);
            }
        }
        if (problems.length === 0) {
            throw new Error('Failed to parse any problems from NIM response');
        }
        const verified = [];
        for (const p of problems) {
            const isValid = await verifyAnswer(apiKey, p.content, p.answer);
            if (isValid) {
                verified.push(p);
            }
        }
        if (verified.length === 0) {
            throw new Error('All generated problems failed answer verification. Try a different category.');
        }
        return verified;
    }
    catch (err) {
        console.error('NVIDIA NIM generation error:', err);
        throw err;
    }
}
