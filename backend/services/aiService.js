// ============================================================================
// AI SERVICE — SAAME (Smart Attendance & Academic Management Ecosystem)
// Built by OneZeroLabs for MLA Academy of Higher Learning, Bangalore
// ============================================================================

const Groq = require('groq-sdk');
require('dotenv').config();

class AIService {
  constructor() {
    this.groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    this.model = 'llama-3.3-70b-versatile';
    this.fallbackModel = 'llama-3.1-8b-instant';
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  // ================================================================
  // QUERY GENERATION — Deterministic JSON for MongoDB
  // Temperature 0.0 · JSON mode · Step-by-step reasoning
  // ================================================================
  async generateQuery(prompt) {
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 [QueryGen] Groq [${currentModel}] attempt ${attempt}`);

        const completion = await this.groq.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are a MongoDB query generator for SAAME, a college attendance system at MLA Academy of Higher Learning.

THINK STEP BY STEP:
1. Identify what the user is asking about (student, teacher, attendance, subject)
2. Determine which collection to query
3. Decide the operation (find, countDocuments, aggregate)
4. Build the query with exact field names
5. Output ONLY valid JSON — no markdown, no explanation, no code blocks

OUTPUT FORMAT:
{"collection":"","operation":"","query":{},"explanation":""}

COLLECTIONS & EXACT FIELD NAMES:
- students: studentID, name, stream, semester, parentPhone, mentorEmail, languageSubject, electiveSubject, academicYear, isActive
- teachers: name, email, phone, department, createdSubjects[{subject, stream, semester, subjectCode}], mentees[{name, studentID, stream, semester}]
- subjects: name, subjectCode, stream, semester, subjectType ("CORE"/"ELECTIVE"), isLanguageSubject, isActive
- attendance: stream, semester, subject, subjectCode, date (ISO string), time, teacherEmail, teacherName, studentsPresent (array of studentIDs), totalStudents, presentCount, absentCount

CRITICAL RULES:
- ALWAYS add "isActive": true for students and subjects queries
- DATE QUERIES: Use {"$regex": "^YYYY-MM-DD"} — NEVER use $date or $dateFromString
- NAME SEARCHES: Use {"$regex": "name", "$options": "i"}
- MULTI-WORD INDIAN NAMES: Use lookahead regex "(?=.*word1)(?=.*word2)" to match any order (e.g. "Pruthvi M U", "Mohammed S K")
- Return {"collection":null,"operation":null,"query":null,"explanation":"..."} for greetings or non-database questions
- Keep queries as simple as possible
- Use countDocuments for count queries
- Use aggregate ONLY when joining collections is necessary
- Student ID pattern: U18ER24C00XX

STREAM SYNONYMS:
- "bachelor of commerce" / "b.com" → BCOM
- "bachelor of computer applications" / "b.c.a" → BCA
- "bachelor of business administration" / "b.b.a" → BBA
- "data analytics" → BDA
- "master of computer applications" / "m.c.a" → MCA
- "master of business administration" / "m.b.a" → MBA
- Streams are ALWAYS stored UPPERCASE`
            },
            { role: 'user', content: prompt }
          ],
          model: currentModel,
          temperature: 0.0,
          top_p: 0.1,
          max_tokens: 1536,
          response_format: { type: 'json_object' }
        });

        return completion.choices[0]?.message?.content
          || '{"collection":null,"operation":null,"query":null,"explanation":"Failed"}';

      } catch (error) {
        console.error(`❌ [QueryGen] attempt ${attempt}:`, error.message);

        // JSON mode unsupported — fall back to text generation
        if (error.message?.includes('response_format') || error.message?.includes('json_object')) {
          console.log('⚠️ JSON mode unsupported, falling back to generateResponse');
          return await this.generateResponse(prompt);
        }

        // Rate limited — switch to fallback model
        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited, switching to ${this.fallbackModel}`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        // Server overloaded — exponential backoff
        if (error.status === 503 || error.status === 429) {
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        throw new Error('AI Error: ' + error.message);
      }
    }

    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // RESPONSE GENERATION — Format DB results naturally
  // Temperature 0.1 · Markdown · Attendance labels · Insights
  // ================================================================
  async generateResponse(prompt) {
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 [Response] Groq [${currentModel}] attempt ${attempt}`);

        const completion = await this.groq.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: `You are SAAME, a smart, conversational, and precise academic AI assistant for MLA Academy of Higher Learning (like ChatGPT or Claude).

ABSOLUTE RULES — NEVER BREAK:
- ONLY use the data explicitly provided in the user's prompt. NEVER invent, hallucinate, or guess any names, IDs, or attendance figures.
- If data is missing, say "not available" — never substitute or estimate.
- Use EXACT values from the database — never round or change numbers.
- Format beautifully using Markdown: **bold** labels, tables, and headers.
- Be helpful, conversational, and friendly! Use a warm tone. Emojis are welcome.

ATTENDANCE STATUS LABELS:
- >= 90% → Excellent
- >= 75% → Good
- >= 50% → Low
- < 50% → Critical

Always end your response with a helpful, conversational one-line insight or friendly suggestion if the data reveals something notable.`
            },
            { role: 'user', content: prompt }
          ],
          model: currentModel,
          temperature: 0.1,
          top_p: 0.4,
          max_tokens: 2048
        });

        return completion.choices[0]?.message?.content || 'No response generated';

      } catch (error) {
        console.error(`❌ [Response] attempt ${attempt}:`, error.message);

        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited, switching to ${this.fallbackModel}`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        if (error.status === 503 || error.status === 429) {
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        throw new Error('AI Error: ' + error.message);
      }
    }

    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // CONVERSATIONAL RESPONSE — Multi-turn with history
  // Temperature 0.15 · Last 8 messages · Context-aware
  // ================================================================
  async generateResponseWithHistory(prompt, conversationHistory = []) {
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 [History] Groq [${currentModel}] history=${conversationHistory.length} attempt ${attempt}`);

        const messages = [
          {
            role: 'system',
            content: `You are SAAME, the academic AI assistant for MLA Academy of Higher Learning.

CRITICAL ACCURACY RULES:
1. ONLY use data explicitly provided. NEVER invent names, IDs, percentages, or stats.
2. If 0 results returned, say "No records found" — do NOT fabricate results.
3. Use EXACT values from database — never estimate or round.
4. Maintain conversation context for follow-up questions.

PERSONALITY:
- Warm, professional, concise (2-4 sentences for general chat)
- Use Markdown tables/headers/bold for data formatting
- No emojis
- For greetings, briefly mention 2-3 things you can help with`
          }
        ];

        // Include last 8 messages for context
        conversationHistory.slice(-8).forEach(msg => {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: (msg.content || '').substring(0, 2000)
          });
        });

        messages.push({ role: 'user', content: prompt });

        const completion = await this.groq.chat.completions.create({
          messages,
          model: currentModel,
          temperature: 0.15,
          top_p: 0.5,
          max_tokens: 2048
        });

        return completion.choices[0]?.message?.content || 'No response generated';

      } catch (error) {
        console.error(`❌ [History] attempt ${attempt}:`, error.message);

        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited, switching to ${this.fallbackModel}`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        if (error.status === 503 || error.status === 429) {
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        throw new Error('AI Error: ' + error.message);
      }
    }

    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // GENERAL QUESTION HANDLER — College knowledge base
  // Temperature 0.3 · Last 6 messages · Full policy reference
  // ================================================================
  async answerGeneralQuestion(question, conversationHistory = []) {
    let currentModel = this.model;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`🤖 [General] Groq [${currentModel}] attempt ${attempt}`);

        const messages = [
          {
            role: 'system',
            content: `You are SAAME (Smart Attendance & Academic Management Ecosystem), the official, highly intelligent, and friendly AI academic assistant for MLA Academy of Higher Learning, Bangalore. You are designed to feel like ChatGPT, Gemini, or Claude — natural, helpful, engaging, and highly insightful.

== COLLEGE KNOWLEDGE BASE ==

ATTENDANCE POLICY:
- Minimum 75% attendance required per subject to sit for exams
- Students below 75% are "defaulters" and may be detained
- Attendance is tracked per subject individually, not as overall average
- Condonation possible for 65-74% with valid medical/genuine reason (max once per semester)
- Medical leave requires documentation submitted to HOD within 3 days

STREAMS & DURATION:
- BCA (Bachelor of Computer Applications) — 3 years, 6 semesters
- BBA (Bachelor of Business Administration) — 3 years, 6 semesters
- BCom / BCom A&F (Bachelor of Commerce) — 3 years, 6 semesters
- BDA (Bachelor of Data Analytics) — 3 years, 6 semesters
- MCA (Master of Computer Applications) — 2 years, 4 semesters
- MBA (Master of Business Administration) — 2 years, 4 semesters

ACADEMIC STRUCTURE:
- Semester system, 2 semesters per academic year
- Internal Assessment (IA) + Semester End Examination (SEE)
- Students are promoted automatically based on attendance + IA scores
- NAAC accredited institution, NBA compliance tracked per program

NAAC & NBA:
- NAAC = National Assessment and Accreditation Council (grades: A++, A+, A, B++, B+, B, C, D)
- NBA = National Board of Accreditation (program-level accreditation)
- Attendance records are a key NAAC criterion (Teaching-Learning & Evaluation)
- SAAME auto-generates NAAC/NBA compliance reports

ABOUT SAAME SYSTEM:
- SAAME = Smart Attendance & Academic Management Ecosystem
- Built by OneZeroLabs (onezerolabs.in) for MLA Academy
- Features: offline-first Android APK, real-time attendance, AI assistant (you!), automated promotion, NAAC reports, mentor management
- Firebase Auth for secure login, MongoDB for data, hosted on private VPS
- Teachers mark attendance via mobile app, data syncs to cloud

EXAM & PROMOTION RULES:
- Minimum 40% marks in internal + external combined to pass a subject
- Students with backlogs must clear them in the next available exam
- Promotion to next semester is automatic if attendance and IA criteria are met

== RESPONDING RULES ==

PERSONALITY & TONE:
- Speak naturally like a brilliant, warm human assistant.
- Use emojis appropriately to make the conversation lively and friendly!
- Structure your answers beautifully using Markdown (headers, bullet points, bold text).
- Be concise when needed, but thorough if explaining complex policies.

WHEN USER IS FRUSTRATED, COMPLAINING, OR SAYS DATA IS WRONG:
- Apologize warmly and empathetically. "I'm so sorry about that! Let's figure this out..."
- NEVER be defensive. Offer variations of searches they can try to get the right data.

WHEN USER ASKS ABOUT SPECIFIC DATA OUT OF CONTEXT (e.g. "tanisha karve" or "who is amrutha"):
- NEVER say "I don't have real-time access" or act like a limited bot.
- Instead, smoothly say: "I'd love to help with that! To look up their records, could you please try asking: **'Find student [Name]'** or **'Show [Name]'s attendance'**?"
- Provide 1-2 copyable example queries.

COMPLETELY UNRELATED QUESTIONS:
- Gently pivot back: "I specialize in MLA Academy's academic system! I can't help with that, but I'm right here if you need any attendance reports or policy info. 😊"

CRITICAL: Never hallucinate student names, IDs, or marks. You are the official SAAME AI.`
          }
        ];

        // Include last 6 messages for context
        conversationHistory.slice(-6).forEach(msg => {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: (msg.content || '').substring(0, 1500)
          });
        });

        messages.push({ role: 'user', content: question });

        const completion = await this.groq.chat.completions.create({
          messages,
          model: currentModel,
          temperature: 0.3,
          top_p: 0.6,
          max_tokens: 1024
        });

        return completion.choices[0]?.message?.content
          || "I'm not sure about that. Please contact the administration for more details.";

      } catch (error) {
        console.error(`❌ [General] attempt ${attempt}:`, error.message);

        if ((error.status === 429 || error.message?.includes('rate')) && currentModel === this.model) {
          console.log(`⚠️ Rate limited, switching to ${this.fallbackModel}`);
          currentModel = this.fallbackModel;
          await this.sleep(this.retryDelay);
          continue;
        }

        if (error.status === 503 || error.status === 429) {
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        throw new Error('AI Error: ' + error.message);
      }
    }

    throw new Error('AI API unavailable after retries');
  }

  // ================================================================
  // INTENT CLASSIFIER — 4-layer system
  //
  // Layer 1: Possessive DB override    (regex, no API)
  // Layer 2: Bare name detection       (regex, no API)
  // Layer 3: Conversational override   (regex, no API)
  // Layer 4: AI classification         (Groq API call)
  //          └── Fallback: keyword matching if API fails
  // ================================================================
  async classifyIntentWithAI(question) {
    const q = question.toLowerCase().trim();

    // ================================================================
    // LAYER 1 — POSSESSIVE + ACADEMIC KEYWORD
    // "What is Tanisha's attendance?" → DB
    // "Pruthvi's subjects" → DB
    // "report for Tanisha" → DB
    // "attendance of Pruthvi" → DB
    // These MUST reach MongoDB regardless of question structure
    // ================================================================
    const possessiveDbPatterns = [
      /\w+'s\s+(attendance|report|subjects?|details?|info|marks?|profile|mentor|mentees?|classes?)/i,
      /(attendance|report|subjects?|marks?|profile)\s+(of|for)\s+[a-zA-Z]/i,
    ];

    if (possessiveDbPatterns.some(p => p.test(question))) {
      console.log(`🗄️ [Intent] Layer 1 — Possessive DB override → database: "${question}"`);
      return 'database';
    }

    // ================================================================
    // LAYER 2 — BARE NAME DETECTION
    // "tanisha karve" / "pruthvi m u" / "tanisha vishal karve"
    // 1-5 words, all alphabetic, no question/action words → person search
    // ================================================================
    const words = q.split(/\s+/);
    const actionWords = [
      'what', 'why', 'how', 'when', 'where', 'which', 'is', 'are', 'was', 'were',
      'do', 'does', 'did', 'can', 'could', 'should', 'would', 'will', 'show', 'list',
      'find', 'tell', 'explain', 'get', 'give', 'display', 'hi', 'hello', 'hey',
      'yes', 'no', 'ok', 'okay', 'thanks', 'thank'
    ];

    const isBareName = (
      words.length >= 1 &&
      words.length <= 5 &&
      !actionWords.includes(words[0]) &&
      !q.includes('?') &&
      !q.includes('attendance') &&
      /^[a-zA-Z\s]+$/.test(q) &&
      words.every(w => w.length > 1)
    );

    if (isBareName) {
      console.log(`🗄️ [Intent] Layer 2 — Bare name → database: "${question}"`);
      return 'database';
    }

    // ================================================================
    // LAYER 3 — CONVERSATIONAL OVERRIDE (hard rules)
    // Complaints, explanations, meta questions → always general
    // ================================================================
    const conversationalPatterns = [
      /^why\b/i,                                            // "why you showing 347..."
      /^how\s+(do|does|can|is|are|come|did)\b/i,           // "how does this work"
      /^what\s+is\s+(a|an|the)\s+\w/i,                    // "what is a defaulter"
      /^what\s+is\s+[A-Z]{2,}(\s|$|\?)/,                  // "what is NAAC" — acronym
      /^what\s+does\b/i,                                    // "what does defaulter mean"
      /^what\s+are\s+the\b/i,                              // "what are the rules"
      /^explain\b/i,                                        // "explain attendance policy"
      /^tell\s+me\s+(about|how|why|what)\b/i,              // "tell me about NAAC"
      /^can\s+you\b/i,                                      // "can you explain..."
      /^do\s+you\b/i,                                       // "do you know..."
      /^are\s+you\b/i,                                      // "are you smart"
      /^is\s+(this|it|that)\b/i,                           // "is this correct"
      /^that('s|\s+is)\b/i,                                // "that's wrong"
      /^this\s+is\b/i,                                      // "this is incorrect"
      /^i\s+(think|feel|want|need|dont|don't|asked|said|told)\b/i,
      /^(wrong|incorrect|bad|stupid|dumb|seriously|really\?|not\s+right)/i,
      /^\d+\s+(is|are)\s+(too|wrong|not|way|incorrect)/i,  // "347 is too many"
      /^(stop|no|wait|hmm|huh|oh|ok\s+but|but\s+why)/i,
      /^you\s+(are|said|told|showed|showing|gave|giving)/i, // "you are showing wrong"
      /^(that|this|it)\s+(doesn't|dont|does not|is not|isn't|looks)\b/i,
      /^(seems|looks)\s+(wrong|incorrect|off|weird|strange)/i,
    ];

    if (conversationalPatterns.some(p => p.test(q))) {
      console.log(`🗣️ [Intent] Layer 3 — Conversational override → general: "${question}"`);
      return 'general';
    }

    // ================================================================
    // LAYER 4 — AI CLASSIFICATION (Groq API call)
    // Uses fallback model (8b) for speed · temperature 0.0 · max 5 tokens
    // Falls back to keyword matching if API call fails
    // ================================================================
    try {
      console.log(`🤖 [Intent] Layer 4 — AI classification for: "${question}"`);

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: 'system',
            content: `You classify questions for a college attendance management chatbot. Return ONLY one word: "database" or "general".

"database" = needs MongoDB query (student data, attendance records, teacher info, counts, reports)
"general" = answerable from knowledge or is conversational (policies, rules, greetings, complaints, explanations)

EXAMPLES:
"show BCA students" → database
"Tanisha's attendance" → database
"tanisha karve" → database
"pruthvi m u" → database
"how many students in BBA" → database
"who teaches computer science" → database
"today's classes" → database
"list defaulters" → database
"attendance report for Amrutha" → database
"compare BCA and BBA attendance" → database
"top 5 students" → database
"find student U18ER24C0037" → database
"classes taken by Dr. Sharma today" → database
"students with low attendance" → database
"who is the mentor for Amrutha" → database
"what is NAAC" → general
"what is a defaulter" → general
"explain the attendance policy" → general
"that's wrong" → general
"how does condonation work" → general
"what streams are offered" → general
"tell me about SAAME" → general
"you are showing incorrect data" → general
"347 is too many" → general
"who built this system" → general

Return ONLY "database" or "general". Nothing else.`
          },
          { role: 'user', content: question }
        ],
        model: this.fallbackModel,
        temperature: 0.0,
        max_tokens: 5
      });

      const result = (completion.choices[0]?.message?.content || '').toLowerCase().trim();

      if (result.includes('database')) {
        console.log(`🗄️ [Intent] Layer 4 — AI → database: "${question}"`);
        return 'database';
      }
      if (result.includes('general')) {
        console.log(`🗣️ [Intent] Layer 4 — AI → general: "${question}"`);
        return 'general';
      }

      // AI returned something unexpected — fall through to keyword matching
      console.log(`⚠️ [Intent] Layer 4 — AI returned unexpected: "${result}", falling back to keywords`);

    } catch (error) {
      console.error(`⚠️ [Intent] Layer 4 — AI classification failed: ${error.message}, falling back to keywords`);
    }

    // ================================================================
    // FALLBACK — KEYWORD MATCHING (if AI call failed or returned junk)
    // ================================================================
    const dbSignals = [
      'student', 'teacher', 'subject', 'semester', 'stream',
      'attendance', 'absent', 'present', 'defaulter',
      'mentor', 'bca', 'bba', 'bcom', 'mca', 'mba', 'bda',
      'today', 'yesterday', 'top', 'bottom',
      'report', 'count', 'total', 'stats', 'compare', 'rank',
      'percent', '%', 'class',
      'email', 'phone', 'list', 'show', 'find', 'who is'
    ];

    if (dbSignals.some(signal => q.includes(signal))) {
      console.log(`🗄️ [Intent] Fallback — keyword match → database: "${question}"`);
      return 'database';
    }

    console.log(`💬 [Intent] Fallback — no signal → general: "${question}"`);
    return 'general';
  }

  // ================================================================
  // UTILITY — Sleep helper for retry delays
  // ================================================================
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ================================================================
// SINGLETON EXPORT
// ================================================================
module.exports = new AIService();