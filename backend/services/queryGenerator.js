// ============================================================================
// QUERY GENERATOR - FULL UPDATED VERSION WITH GROQ
// ============================================================================

const aiService = require('./aiService');
const { getSchemaContext } = require('../utils/schemaContext');
const { getDB } = require('../config/database');
const { ObjectId } = require('mongodb');

// ============================================================================
// PARSE DATE FROM QUERY
// ============================================================================

function parseDateFromQuery(question) {
  const lowerQ = question.toLowerCase();

  const datePatterns = [
    /(\d{2})-(\d{2})-(\d{4})/,
    /(\d{2})\/(\d{2})\/(\d{4})/,
    /(\d{4})-(\d{2})-(\d{2})/
  ];

  for (const pattern of datePatterns) {
    const match = question.match(pattern);
    if (match) {
      if (pattern === datePatterns[2]) return match[0];
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
  }

  if (lowerQ.includes('today')) return new Date().toISOString().split('T')[0];

  if (lowerQ.includes('yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  if (lowerQ.includes('day before yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return d.toISOString().split('T')[0];
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const lastDayMatch = lowerQ.match(/last\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i);
  if (lastDayMatch) {
    const targetDay = dayNames.indexOf(lastDayMatch[1].toLowerCase());
    const now = new Date();
    let daysAgo = now.getDay() - targetDay;
    if (daysAgo <= 0) daysAgo += 7;
    now.setDate(now.getDate() - daysAgo);
    return now.toISOString().split('T')[0];
  }

  const months = {
    jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03',
    apr: '04', april: '04', may: '05', jun: '06', june: '06', jul: '07', july: '07',
    aug: '08', august: '08', sep: '09', september: '09', oct: '10', october: '10',
    nov: '11', november: '11', dec: '12', december: '12'
  };

  const monthDayMatch = lowerQ.match(/(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?/i);
  if (monthDayMatch) {
    const monthNum = months[monthDayMatch[1].toLowerCase()];
    const day = monthDayMatch[2].padStart(2, '0');
    const year = monthDayMatch[3] || new Date().getFullYear().toString();
    return `${year}-${monthNum}-${day}`;
  }

  const dayMonthMatch = lowerQ.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{4}))?/i);
  if (dayMonthMatch) {
    const monthNum = months[dayMonthMatch[2].toLowerCase()];
    const day = dayMonthMatch[1].padStart(2, '0');
    const year = dayMonthMatch[3] || new Date().getFullYear().toString();
    return `${year}-${monthNum}-${day}`;
  }

  return null;
}

// ============================================================================
// DETECT STREAM
// ============================================================================

function detectStream(text) {
  const lowerText = text.toLowerCase();
  const streamSynonyms = {
    'bachelor of commerce': 'BCOM', 'b.com': 'BCOM',
    'bcom a and f': 'BCom A&F', 'bcom a&f': 'BCom A&F',
    'bachelor of computer applications': 'BCA', 'b.c.a': 'BCA',
    'bachelor of business administration': 'BBA', 'b.b.a': 'BBA',
    'master of computer applications': 'MCA', 'm.c.a': 'MCA',
    'master of business administration': 'MBA', 'm.b.a': 'MBA',
    'bachelor of data analytics': 'BDA', 'data analytics': 'BDA',
  };
  for (const [synonym, code] of Object.entries(streamSynonyms)) {
    if (lowerText.includes(synonym)) return code;
  }
  const knownStreams = ['bca', 'bba', 'bcom', 'mca', 'mba', 'bda', 'bsc', 'ba', 'btech', 'mtech', 'msc', 'ma'];
  const words = lowerText.match(/\b([a-z]{2,5})\b/gi) || [];
  for (const word of words) {
    if (knownStreams.includes(word.toLowerCase())) return word.toUpperCase();
  }
  return null;
}

// ============================================================================
// DETECT SEMESTER
// ============================================================================

function detectSemester(text) {
  const patterns = [/sem(?:ester)?\s*(\d)/i, /(\d)(?:st|nd|rd|th)?\s*sem/i, /\bsem(\d)\b/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return parseInt(match[1]);
  }
  return null;
}

// ============================================================================
// EXTRACT NAMES
// ============================================================================

function extractStudentName(text) {
  const patterns = [
    /(?:attendance|report|classes|sessions).*?(?:of|for|by|student|named?|has)\s+([a-zA-Z0-9\s]+?)(?:\?|$)/i,
    /(?:what\s+is|show|get|find|tell\s+me\s+about)?\s*([a-zA-Z0-9\s]{3,30}?)(?:'s\s+|\s+)(?:attendance|report|profile|details|info)/i,
    /(?:student|find|search|get|show)\s+(.+?)(?:'s|\s+attendance|\s+details|\s+info|\?|$)/i,
    /(?:attendance|report|details|info)\s+(?:of|for)\s+(.+?)(?:\?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim().replace(/^(?:student|named?)\s+/i, '');
      if (name.length > 2) {
        const words = name.split(/\s+/).filter(w => w.length > 0);
        if (words.length > 1) return words.map(w => `(?=.*${w})`).join('');
        return name;
      }
    }
  }
  return null;
}

function extractTeacherName(text) {
  const patterns = [
    /(?:who\s+is|tell\s+me\s+about)\s+(?:the\s+)?(?:teacher\s+)?(.+?)(?:\?|$)/i,
    /(?:find|search|get|show|details|info|about)\s+(?:the\s+)?teacher\s+(?:named\s+)?(.+?)(?:\?|$)/i,
    /teacher\s+(?:named?\s+)?(.+?)(?:\s+details|\s+info|\s+email|\s+contact|\s+subjects|\?|$)/i,
    /(?:details|info|profile|data)\s+(?:of|for|about)\s+(?:teacher\s+)?(.+?)(?:\?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let name = match[1].trim().replace(/\s+(?:teacher|sir|madam|mam)$/i, '');
      if (name.length > 2) return name;
    }
  }
  return null;
}

function extractSubjectName(text) {
  const patterns = [
    /(?:who\s+teaches|teacher\s+(?:of|for)|teaches)\s+(.+?)(?:\s+subject|\s+class|\s+in|\?|$)/i,
    /(.+?)\s+(?:subject|class)\s+teacher/i,
    /subject\s+(.+?)(?:\s+teacher|\?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}

function extractStudentID(text) {
  const patterns = [
    /\b([a-zA-Z0-9]{8,15})\b/,
    /(?:ID|USN|roll)\s*(?:is|of|for)?\s*([a-zA-Z0-9]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

// ============================================================================
// PRE-BUILT QUERY TEMPLATES
// ============================================================================

function buildStudentAttendanceQuery(studentName, specificDate = null) {
  console.log(`🎯 [Pre-built] Attendance for: ${studentName}, Date: ${specificDate || 'all'}`);

  let smartRegex = studentName;
  if (studentName.includes(' ') && !studentName.includes('(?=')) {
    const words = studentName.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) smartRegex = words.map(w => `(?=.*${w})`).join('');
  }

  const dateFilter = specificDate
    ? [{ "$regexMatch": { "input": "$date", "regex": `^${specificDate}` } }]
    : [];

  return {
    collection: "students",
    operation: "aggregate",
    query: [
      { "$match": { "name": { "$regex": smartRegex, "$options": "i" }, "isActive": true } },
      { "$limit": 1 },
      {
        "$lookup": {
          "from": "attendance",
          "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" },
          "pipeline": [
            {
              "$match": {
                "$expr": {
                  "$and": [
                    { "$eq": ["$stream", "$$stream"] },
                    { "$eq": ["$semester", "$$semester"] },
                    ...dateFilter
                  ]
                }
              }
            },
            {
              "$group": {
                "_id": "$subject",
                "totalClasses": { "$sum": 1 },
                "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } }
              }
            },
            {
              "$project": {
                "subject": "$_id", "totalClasses": 1,
                "classesAttended": "$attended",
                "attendancePercentage": {
                  "$multiply": [{ "$divide": ["$attended", "$totalClasses"] }, 100]
                },
                "_id": 0
              }
            }
          ],
          "as": "attendance"
        }
      },
      {
        "$lookup": {
          "from": "subjects",
          "let": { "stream": "$stream", "semester": "$semester" },
          "pipeline": [
            {
              "$match": {
                "$expr": {
                  "$and": [
                    { "$eq": [{ "$toUpper": "$stream" }, { "$toUpper": "$$stream" }] },
                    { "$eq": ["$semester", "$$semester"] },
                    { "$eq": ["$isLanguageSubject", true] }
                  ]
                }
              }
            },
            { "$project": { "name": 1, "_id": 0 } }
          ],
          "as": "languageSubjects"
        }
      },
      {
        "$addFields": {
          "langSubjectNames": { "$map": { "input": "$languageSubjects", "as": "ls", "in": { "$toUpper": "$$ls.name" } } },
          "studentLangUpper": { "$toUpper": { "$ifNull": ["$languageSubject", ""] } }
        }
      },
      { "$unwind": "$attendance" },
      {
        "$match": {
          "$expr": {
            "$or": [
              { "$not": { "$in": [{ "$toUpper": "$attendance.subject" }, "$langSubjectNames"] } },
              { "$eq": [{ "$toUpper": "$attendance.subject" }, "$studentLangUpper"] }
            ]
          }
        }
      },
      {
        "$replaceRoot": {
          "newRoot": {
            "$mergeObjects": [
              "$attendance",
              { "studentName": "$name", "studentID": "$studentID", "stream": "$stream", "semester": "$semester" }
            ]
          }
        }
      }
    ],
    explanation: `Complete attendance report for ${studentName}${specificDate ? ` on ${specificDate}` : ''}`
  };
}

function buildStudentComparisonQuery(studentName) {
  let smartRegex = studentName;
  if (studentName.includes(' ') && !studentName.includes('(?=')) {
    const words = studentName.split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) smartRegex = words.map(w => `(?=.*${w})`).join('');
  }

  return {
    collection: "students",
    operation: "aggregate",
    query: [
      { "$match": { "name": { "$regex": smartRegex, "$options": "i" }, "isActive": true } },
      { "$limit": 1 },
      {
        "$lookup": {
          "from": "attendance",
          "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" },
          "pipeline": [
            {
              "$match": {
                "$expr": {
                  "$and": [
                    { "$eq": ["$stream", "$$stream"] },
                    { "$eq": ["$semester", "$$semester"] }
                  ]
                }
              }
            },
            {
              "$group": {
                "_id": "$subject",
                "totalClasses": { "$sum": 1 },
                "totalPresentInClass": { "$sum": "$presentCount" },
                "totalStudentsInClass": { "$sum": "$totalStudents" },
                "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } }
              }
            },
            {
              "$project": {
                "subject": "$_id", "totalClasses": 1,
                "classesAttended": "$attended",
                "attendancePercentage": {
                  "$cond": [
                    { "$gt": ["$totalClasses", 0] },
                    { "$multiply": [{ "$divide": ["$attended", "$totalClasses"] }, 100] },
                    0
                  ]
                },
                "classAverage": {
                  "$cond": [
                    { "$gt": ["$totalStudentsInClass", 0] },
                    { "$multiply": [{ "$divide": ["$totalPresentInClass", "$totalStudentsInClass"] }, 100] },
                    0
                  ]
                },
                "_id": 0
              }
            }
          ],
          "as": "attendance"
        }
      },
      { "$unwind": "$attendance" },
      {
        "$replaceRoot": {
          "newRoot": {
            "$mergeObjects": [
              "$attendance",
              { "studentName": "$name", "studentID": "$studentID", "stream": "$stream", "semester": "$semester" }
            ]
          }
        }
      }
    ],
    explanation: `Attendance comparison for ${studentName} vs class average`
  };
}

// ============================================================================
// EXECUTE QUERY
// ============================================================================

async function executeQuery(queryInfo) {
  const { collection, operation, query, projection } = queryInfo;
  console.log(`🔍 [Execute] ${operation} on ${collection}`);

  try {
    const db = getDB();
    if (!db) throw new Error('Database not connected');

    const coll = db.collection(collection);
    let results;

    const fullProjections = {
      students: { studentID: 1, name: 1, stream: 1, semester: 1, parentPhone: 1, mentorEmail: 1, languageSubject: 1, electiveSubject: 1, academicYear: 1, isActive: 1 },
      teachers: { name: 1, email: 1, phone: 1, department: 1, createdSubjects: 1 },
      subjects: { name: 1, subjectCode: 1, stream: 1, semester: 1, subjectType: 1, teacherAssigned: 1, isActive: 1 },
      attendance: { stream: 1, semester: 1, subject: 1, subjectCode: 1, date: 1, time: 1, studentsPresent: 1, totalStudents: 1, presentCount: 1, absentCount: 1, teacherEmail: 1, teacherName: 1 }
    };

    switch (operation) {
      case 'find':
        // Smart regex fix for multi-word names
        if (['students', 'teachers'].includes(collection) && query?.name && typeof query.name.$regex === 'string') {
          const orig = query.name.$regex;
          if (orig.includes(' ') && !orig.includes('(?=')) {
            const words = orig.split(/\s+/).filter(w => w.length > 0);
            if (words.length > 1) {
              query.name.$regex = words.map(w => `(?=.*${w})`).join('');
              console.log(`🧠 Smart regex: "${orig}" → "${query.name.$regex}"`);
            }
          }
        }

        let useProjection = projection || fullProjections[collection] || null;
        if (collection === 'students' && useProjection && !useProjection.mentorEmail) {
          useProjection = { ...useProjection, mentorEmail: 1 };
        }

        results = useProjection
          ? await coll.find(query).project(useProjection).toArray()
          : await coll.find(query).toArray();

        console.log(`✅ Found ${results.length} documents`);

        // Enrich students with mentor name
        if (collection === 'students' && results.length > 0 && results.length <= 50) {
          const mentorEmails = [...new Set(results.filter(r => r.mentorEmail).map(r => r.mentorEmail))];
          if (mentorEmails.length > 0) {
            const mentors = await db.collection('teachers')
              .find({ email: { $in: mentorEmails } })
              .project({ name: 1, email: 1 })
              .toArray();
            const mentorMap = {};
            mentors.forEach(m => { mentorMap[m.email] = m.name; });
            results.forEach(r => {
              r.mentorName = r.mentorEmail ? (mentorMap[r.mentorEmail] || 'Not Assigned') : 'Not Assigned';
            });
          } else {
            results.forEach(r => { r.mentorName = 'Not Assigned'; });
          }
        }

        // Fallback: if student search empty, try teachers
        if (results.length === 0 && collection === 'students' && query?.name?.$regex) {
          const teacherResults = await db.collection('teachers')
            .find({ name: { $regex: query.name.$regex, $options: 'i' } })
            .toArray();
          if (teacherResults.length > 0) {
            console.log(`✅ Fallback: found ${teacherResults.length} in teachers`);
            results = teacherResults;
          }
        }
        break;

      case 'countDocuments':
        results = await coll.countDocuments(query);
        console.log(`✅ Count: ${results}`);
        break;

      case 'aggregate':
        // Smart regex fix in aggregate $match stages
        if (['students', 'teachers'].includes(collection) && Array.isArray(query)) {
          const matchStage = query.find(s => s.$match?.name && typeof s.$match.name.$regex === 'string');
          if (matchStage) {
            const orig = matchStage.$match.name.$regex;
            if (orig.includes(' ') && !orig.includes('(?=')) {
              const words = orig.split(/\s+/).filter(w => w.length > 0);
              if (words.length > 1) {
                matchStage.$match.name.$regex = words.map(w => `(?=.*${w})`).join('');
                console.log(`🧠 Smart regex (aggregate): "${orig}" → "${matchStage.$match.name.$regex}"`);
              }
            }
          }
        }

        results = await coll.aggregate(query).toArray();
        console.log(`✅ Aggregation: ${results.length} documents`);

        // Handle empty aggregate on student attendance
        if (results.length === 0 && collection === 'students') {
          const queryStr = JSON.stringify(query);
          const nameMatch = queryStr.match(/"name":\s*\{\s*"\$regex"\s*:\s*"([^"]+)"/);
          if (nameMatch) {
            const sName = nameMatch[1];
            const studentExists = await db.collection('students').findOne({
              name: { $regex: sName, $options: 'i' }, isActive: true
            });
            if (studentExists) {
              const attCount = await db.collection('attendance').countDocuments({
                stream: studentExists.stream, semester: studentExists.semester
              });
              if (attCount === 0) {
                throw new Error(`NO_ATTENDANCE_RECORDS:${studentExists.name}:${studentExists.stream}:${studentExists.semester}`);
              } else {
                throw new Error(`STUDENT_EXISTS_NO_ATTENDANCE:${studentExists.name}:${studentExists.stream}:${studentExists.semester}:${studentExists.studentID}`);
              }
            } else {
              throw new Error(`STUDENT_NOT_FOUND:${sName}`);
            }
          }
        }
        break;

      case 'subjectWiseDefaulters': {
        // Subject-wise attendance report (same logic as reports.js)
        const { stream: qStream, semester: qSemester } = query;
        console.log(`📊 [Execute] Subject-wise defaulters for ${qStream} Sem ${qSemester}`);

        // 1. Get students
        const swStudents = await db.collection('students')
          .find({ stream: qStream, semester: qSemester, isActive: true })
          .sort({ studentID: 1 })
          .toArray();

        if (swStudents.length === 0) throw new Error(`No students found in ${qStream} Semester ${qSemester}`);

        // 2. Get subjects
        const swSubjects = await db.collection('subjects')
          .find({ stream: qStream, semester: qSemester, isActive: true })
          .sort({ name: 1 })
          .toArray();

        if (swSubjects.length === 0) throw new Error(`No subjects found in ${qStream} Semester ${qSemester}`);

        const subjectNames = swSubjects.map(s => s.name);

        // 3. Get ALL attendance records for this stream/semester in one query
        const allAttendance = await db.collection('attendance')
          .find({ stream: qStream, semester: qSemester })
          .toArray();

        // Group attendance by subject
        const attendanceBySubject = {};
        for (const record of allAttendance) {
          if (!attendanceBySubject[record.subject]) attendanceBySubject[record.subject] = [];
          attendanceBySubject[record.subject].push(record);
        }

        // 4. Calculate per-student per-subject attendance
        const studentReports = [];
        for (const student of swStudents) {
          const subjectData = {};
          let hasDefaultSubject = false;

          for (const subName of subjectNames) {
            const sessions = attendanceBySubject[subName] || [];
            const totalClasses = sessions.length;
            const presentCount = sessions.filter(s =>
              s.studentsPresent && Array.isArray(s.studentsPresent) &&
              s.studentsPresent.includes(student.studentID)
            ).length;
            const percentage = totalClasses > 0 ? Math.round((presentCount / totalClasses) * 100) : 0;

            subjectData[subName] = { present: presentCount, total: totalClasses, percentage };
            if (percentage < 75 && totalClasses > 0) hasDefaultSubject = true;
          }

          if (hasDefaultSubject) {
            studentReports.push({
              studentID: student.studentID,
              name: student.name,
              stream: qStream,
              semester: qSemester,
              subjects: subjectData
            });
          }
        }

        // Sort by number of defaulting subjects (descending)
        studentReports.sort((a, b) => {
          const aDefaults = Object.values(a.subjects).filter(s => s.percentage < 75 && s.total > 0).length;
          const bDefaults = Object.values(b.subjects).filter(s => s.percentage < 75 && s.total > 0).length;
          return bDefaults - aDefaults;
        });

        console.log(`✅ Subject-wise: ${studentReports.length} defaulters out of ${swStudents.length} students`);

        // Return with metadata for the formatter
        results = {
          _subjectWise: true,
          stream: qStream,
          semester: qSemester,
          subjects: subjectNames,
          totalStudents: swStudents.length,
          defaulterCount: studentReports.length,
          students: studentReports
        };
        break;
      }

      default:
        throw new Error(`Unsupported operation: ${operation}`);
    }

    return results;

  } catch (error) {
    console.error(`❌ [Query Error]:`, error.message);
    throw error;
  }
}

// ============================================================================
// GENERATE MONGO QUERY - PRE-BUILT PATTERNS FIRST, GROQ FALLBACK
// ============================================================================

async function generateMongoQuery(question) {
  console.log(`📝 [QueryGen] Question: ${question}`);

  const lowerQuestion = question.toLowerCase();
  const parsedDate = parseDateFromQuery(question);
  const detectedStream = detectStream(question);
  const detectedSemester = detectSemester(question);

  // =========== GREETING / GENERAL CHECK ===========
  if ((await aiService.classifyIntentWithAI(question)) === 'general') {
    return { collection: null, operation: null, query: null, explanation: 'general' };
  }

  // =========== MENTORSHIP QUERIES ===========
  if (lowerQuestion.match(/(?:who|which\s+teacher)\s+is\s+(?:the\s+)?mentor\s+(?:for|of)|mentor\s+(?:for|of)\s+.+/i)) {
    const studentNameFromMentor = (question.match(/mentor\s+(?:for|of)\s+([^?]+)/i) || [])[1] || extractStudentName(question);
    const studentIDFromMentor = extractStudentID(question);
    if (studentNameFromMentor || studentIDFromMentor) {
      const studentMatch = studentIDFromMentor
        ? { "mentees.studentID": { "$regex": "^" + studentIDFromMentor.trim() + "$", "$options": "i" } }
        : { "mentees.name": { "$regex": studentNameFromMentor.trim(), "$options": "i" } };
      return { collection: "teachers", operation: "find", query: studentMatch, projection: { name: 1, email: 1, phone: 1, mentees: 1, _id: 0 }, explanation: `Mentor for student` };
    }
  }

  if (lowerQuestion.match(/(?:list|show|all|get)\s+(?:mentees|assigned\s+students)\s+(?:for|of|under|to)|mentees\s+(?:of|for)\s+/i)) {
    const tName = (question.match(/mentees\s+(?:of|for)\s+([^?]+)/i) || [])[1] || extractTeacherName(question);
    if (tName) {
      return { collection: "teachers", operation: "find", query: { "name": { "$regex": tName.trim(), "$options": "i" } }, projection: { name: 1, mentees: 1, _id: 0 }, explanation: `Mentees of teacher` };
    }
  }

  // =========== ABSENT ON DATE ===========
  if (lowerQuestion.match(/who\s+(?:was|were|is)\s+absent|absent\s+(?:students?|list)|absentees/i) && parsedDate) {
    const matchFilter = { date: { $regex: `^${parsedDate}` } };
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$lookup": { "from": "students", "let": { "stream": "$stream", "semester": "$semester", "present": "$studentsPresent" }, "pipeline": [{ "$match": { "$expr": { "$and": [{ "$eq": ["$stream", "$$stream"] }, { "$eq": ["$semester", "$$semester"] }, { "$eq": ["$isActive", true] }, { "$not": { "$in": ["$studentID", "$$present"] } }] } } }], "as": "absentStudents" } },
        { "$unwind": "$absentStudents" },
        { "$group": { "_id": "$absentStudents.studentID", "name": { "$first": "$absentStudents.name" }, "studentID": { "$first": "$absentStudents.studentID" }, "stream": { "$first": "$absentStudents.stream" }, "semester": { "$first": "$absentStudents.semester" }, "missedSubjects": { "$push": "$subject" }, "missedCount": { "$sum": 1 } } },
        { "$sort": { "missedCount": -1 } },
        { "$project": { "_id": 0, "name": 1, "studentID": 1, "stream": 1, "semester": 1, "missedSubjects": 1, "missedCount": 1 } }
      ],
      explanation: `Absent students on ${parsedDate}`
    };
  }

  // =========== PRESENT ON DATE ===========
  if (lowerQuestion.match(/who\s+(?:was|were|is)\s+present|present\s+(?:students?|list)/i) && parsedDate) {
    const matchFilter = { date: { $regex: `^${parsedDate}` } };
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$lookup": { "from": "students", "let": { "stream": "$stream", "semester": "$semester", "present": "$studentsPresent" }, "pipeline": [{ "$match": { "$expr": { "$and": [{ "$eq": ["$stream", "$$stream"] }, { "$eq": ["$semester", "$$semester"] }, { "$eq": ["$isActive", true] }, { "$in": ["$studentID", "$$present"] }] } } }], "as": "presentStudents" } },
        { "$unwind": "$presentStudents" },
        { "$group": { "_id": "$presentStudents.studentID", "name": { "$first": "$presentStudents.name" }, "studentID": { "$first": "$presentStudents.studentID" }, "stream": { "$first": "$presentStudents.stream" }, "semester": { "$first": "$presentStudents.semester" }, "attendedSubjects": { "$push": "$subject" }, "attendedCount": { "$sum": 1 } } },
        { "$sort": { "name": 1 } },
        { "$project": { "_id": 0, "name": 1, "studentID": 1, "stream": 1, "semester": 1, "attendedSubjects": 1, "attendedCount": 1 } }
      ],
      explanation: `Present students on ${parsedDate}`
    };
  }

  // =========== WHO TEACHES SUBJECT ===========
  const subjectName = extractSubjectName(question);
  if (lowerQuestion.match(/who\s+teaches|teacher\s+(?:of|for)|which\s+teacher/i) && subjectName) {
    return { collection: "teachers", operation: "find", query: { "createdSubjects.subject": { "$regex": subjectName, "$options": "i" } }, explanation: `Teacher who teaches ${subjectName}` };
  }

  // =========== WHO IS X ===========
  if (lowerQuestion.match(/(?:who\s+is|tell\s+me\s+about|about)\s+(?!the\s+mentor)(.+?)(?:\?|$)/i)) {
    const whoMatch = question.match(/(?:who\s+is|tell\s+me\s+about|about)\s+(.+?)(?:\?|$)/i);
    if (whoMatch) {
      let personName = whoMatch[1].trim().replace(/^(?:student|teacher|the)\s+/i, '');
      if (personName.length > 2) {
        try {
          const db = getDB();
          const teacherFound = await db.collection('teachers').findOne({ name: { $regex: personName, $options: 'i' } });
          if (teacherFound) {
            return { collection: "teachers", operation: "find", query: { "name": { "$regex": personName, "$options": "i" } }, explanation: `Teacher: ${personName}` };
          }
        } catch (e) { console.log(`⚠️ Teacher lookup:`, e.message); }
        return { collection: "students", operation: "find", query: { "name": { "$regex": personName, "$options": "i" }, "isActive": true }, explanation: `Student: ${personName}` };
      }
    }
  }

  // =========== SUBJECTS TAUGHT BY TEACHER ===========
  if (lowerQuestion.match(/(?:what|which)\s+subjects?\s+(?:does|do|is)\s+(.+?)\s+teach|subjects?\s+(?:taught|assigned)\s+(?:to|by)\s+(.+)/i)) {
    const tMatch = question.match(/(?:what|which)\s+subjects?\s+(?:does|do|is)\s+(.+?)\s+teach/i) || question.match(/subjects?\s+(?:taught|assigned)\s+(?:to|by)\s+(.+)/i);
    if (tMatch) {
      return { collection: "teachers", operation: "find", query: { "name": { "$regex": tMatch[1].trim(), "$options": "i" } }, explanation: `Subjects taught by ${tMatch[1].trim()}` };
    }
  }

  // =========== TEACHERS LIST ===========
  if (lowerQuestion.match(/(?:list|show|get|all|display)\s+(?:all\s+)?teachers?|teachers?\s+(?:list|in|of|names?)|who\s+are\s+(?:the\s+)?teachers/i)) {
    return { collection: "teachers", operation: "find", query: {}, projection: { name: 1, email: 1, createdSubjects: 1, _id: 0 }, explanation: `All teachers` };
  }

  // =========== TEACHERS BY STREAM ===========
  if (lowerQuestion.match(/teachers?\s+(?:in|of|for|teaching)\s+/i) && detectedStream) {
    return { collection: "teachers", operation: "find", query: { "createdSubjects.stream": { "$regex": `^${detectedStream}$`, "$options": "i" } }, projection: { name: 1, email: 1, createdSubjects: 1, _id: 0 }, explanation: `Teachers in ${detectedStream}` };
  }

  // =========== TEACHER INFO BY NAME ===========
  const teacherNameMatch = extractTeacherName(question);
  if (teacherNameMatch && lowerQuestion.match(/who\s+is|about|teacher|info|tell|details/i)) {
    return { collection: "teachers", operation: "find", query: { "name": { "$regex": teacherNameMatch, "$options": "i" } }, explanation: `Teacher: ${teacherNameMatch}` };
  }

  // =========== CLASSES TAKEN BY TEACHER ===========
  if (lowerQuestion.match(/how\s+many\s+(?:classes|sessions|lectures)\s+(?:taken|conducted|took|did\s+\w+\s+take)\s*(?:by|from|for)?/i)) {
    const tMatch = question.match(/(?:taken|conducted|took|take)\s+(?:by|from|for)?\s*(.+?)(?:\?|$)/i);
    if (tMatch) {
      const teacherSearchTerm = tMatch[1].trim().replace(/^(?:each|all|every)\s+(?:subjects?|classes?)\s*/i, '').trim();
      if (teacherSearchTerm.length > 2) {
        return {
          collection: "attendance", operation: "aggregate",
          query: [
            {
              "$match": {
                "$or": [
                  { "teacherEmail": { "$regex": teacherSearchTerm, "$options": "i" } },
                  { "teacherName": { "$regex": teacherSearchTerm, "$options": "i" } }
                ]
              }
            },
            { "$group": { "_id": { "subject": "$subject", "stream": "$stream", "semester": "$semester" }, "totalClasses": { "$sum": 1 }, "avgAttendance": { "$avg": { "$multiply": [{ "$divide": ["$presentCount", "$totalStudents"] }, 100] } } } },
            { "$project": { "_id": 0, "subject": "$_id.subject", "stream": "$_id.stream", "semester": "$_id.semester", "totalClasses": 1, "avgAttendance": { "$round": ["$avgAttendance", 1] } } },
            { "$sort": { "stream": 1, "semester": 1 } }
          ],
          explanation: `Classes by ${teacherSearchTerm}`
        };
      }
    }
  }

  // =========== 100% ATTENDANCE ===========
  if (lowerQuestion.match(/100\s*%|perfect\s+attendance|full\s+attendance|never\s+absent/i)) {
    const matchFilter = { isActive: true };
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "students", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$lookup": { "from": "attendance", "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" }, "pipeline": [{ "$match": { "$expr": { "$and": [{ "$eq": ["$stream", "$$stream"] }, { "$eq": ["$semester", "$$semester"] }] } } }, { "$group": { "_id": null, "totalClasses": { "$sum": 1 }, "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } } } }], "as": "stats" } },
        { "$unwind": { "path": "$stats", "preserveNullAndEmptyArrays": false } },
        { "$match": { "$expr": { "$eq": ["$stats.totalClasses", "$stats.attended"] } } },
        { "$project": { "_id": 0, "name": 1, "studentID": 1, "stream": 1, "semester": 1, "totalClasses": "$stats.totalClasses", "classesAttended": "$stats.attended" } },
        { "$sort": { "stream": 1, "semester": 1, "name": 1 } }
      ],
      explanation: `Students with 100% attendance`
    };
  }

  // =========== MOST / LEAST ATTENDED SUBJECTS ===========
  if (lowerQuestion.match(/most\s+attended|highest\s+attendance|best\s+attendance/i)) {
    const matchFilter = {};
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$group": { "_id": { "subject": "$subject", "stream": "$stream", "semester": "$semester" }, "totalSessions": { "$sum": 1 }, "avgAttendance": { "$avg": { "$multiply": [{ "$divide": ["$presentCount", "$totalStudents"] }, 100] } } } },
        { "$sort": { "avgAttendance": -1 } }, { "$limit": 10 },
        { "$project": { "_id": 0, "subject": "$_id.subject", "stream": "$_id.stream", "semester": "$_id.semester", "totalSessions": 1, "avgAttendance": { "$round": ["$avgAttendance", 1] } } }
      ],
      explanation: `Most attended subjects`
    };
  }

  if (lowerQuestion.match(/least\s+attended|lowest\s+attendance|worst\s+attendance/i)) {
    const matchFilter = {};
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$group": { "_id": { "subject": "$subject", "stream": "$stream", "semester": "$semester" }, "totalSessions": { "$sum": 1 }, "avgAttendance": { "$avg": { "$multiply": [{ "$divide": ["$presentCount", "$totalStudents"] }, 100] } } } },
        { "$sort": { "avgAttendance": 1 } }, { "$limit": 10 },
        { "$project": { "_id": 0, "subject": "$_id.subject", "stream": "$_id.stream", "semester": "$_id.semester", "totalSessions": 1, "avgAttendance": { "$round": ["$avgAttendance", 1] } } }
      ],
      explanation: `Least attended subjects`
    };
  }

  // =========== TOTAL CLASSES HELD ===========
  if (lowerQuestion.match(/how\s+many\s+(?:classes|sessions|lectures)\s+(?:held|conducted|taken)|total\s+classes/i)) {
    const matchFilter = {};
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    if (parsedDate) matchFilter.date = { $regex: `^${parsedDate}` };
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$group": { "_id": { "subject": "$subject", "stream": "$stream", "semester": "$semester" }, "totalClasses": { "$sum": 1 } } },
        { "$project": { "_id": 0, "subject": "$_id.subject", "stream": "$_id.stream", "semester": "$_id.semester", "totalClasses": 1 } },
        { "$sort": { "stream": 1, "semester": 1, "subject": 1 } }
      ],
      explanation: `Total classes held`
    };
  }

  // =========== COUNT QUERIES ===========
  if (lowerQuestion.match(/how\s+many\s+students?|total\s+students?|count\s+students?/i)) {
    const query = { isActive: true };
    if (detectedStream) query.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) query.semester = detectedSemester;
    return { collection: "students", operation: "countDocuments", query, explanation: `Student count` };
  }

  if (lowerQuestion.match(/how\s+many\s+teachers?|total\s+teachers?|count\s+teachers?/i)) {
    return { collection: "teachers", operation: "countDocuments", query: {}, explanation: `Teacher count` };
  }

  if (lowerQuestion.match(/how\s+many\s+subjects?|total\s+subjects?|count\s+subjects?/i)) {
    const query = { isActive: true };
    if (detectedStream) query.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) query.semester = detectedSemester;
    return { collection: "subjects", operation: "countDocuments", query, explanation: `Subject count` };
  }

  // =========== TOP N STUDENTS ===========
  const topMatch = lowerQuestion.match(/(?:top|best|highest)\s*(\d+)?\s*(?:students?|performers?|attendance)/i);
  if (topMatch) {
    const limit = parseInt(topMatch[1]) || 10;
    const matchFilter = { isActive: true };
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "students", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$lookup": { "from": "attendance", "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" }, "pipeline": [{ "$match": { "$expr": { "$and": [{ "$eq": ["$stream", "$$stream"] }, { "$eq": ["$semester", "$$semester"] }] } } }, { "$group": { "_id": null, "totalClasses": { "$sum": 1 }, "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } } } }], "as": "stats" } },
        { "$unwind": { "path": "$stats", "preserveNullAndEmptyArrays": false } },
        { "$addFields": { "attendancePercentage": { "$cond": [{ "$gt": ["$stats.totalClasses", 0] }, { "$multiply": [{ "$divide": ["$stats.attended", "$stats.totalClasses"] }, 100] }, 0] } } },
        { "$sort": { "attendancePercentage": -1 } }, { "$limit": limit },
        { "$project": { "name": 1, "studentID": 1, "stream": 1, "semester": 1, "attendancePercentage": { "$round": ["$attendancePercentage", 1] }, "classesAttended": "$stats.attended", "totalClasses": "$stats.totalClasses" } }
      ],
      explanation: `Top ${limit} students by attendance`
    };
  }

  // =========== BOTTOM N STUDENTS ===========
  const bottomMatch = lowerQuestion.match(/(?:bottom|worst|lowest)\s*(\d+)?\s*(?:students?|performers?|attendance)/i);
  if (bottomMatch) {
    const limit = parseInt(bottomMatch[1]) || 10;
    const matchFilter = { isActive: true };
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "students", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$lookup": { "from": "attendance", "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" }, "pipeline": [{ "$match": { "$expr": { "$and": [{ "$eq": ["$stream", "$$stream"] }, { "$eq": ["$semester", "$$semester"] }] } } }, { "$group": { "_id": null, "totalClasses": { "$sum": 1 }, "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } } } }], "as": "stats" } },
        { "$unwind": { "path": "$stats", "preserveNullAndEmptyArrays": false } },
        { "$addFields": { "attendancePercentage": { "$cond": [{ "$gt": ["$stats.totalClasses", 0] }, { "$multiply": [{ "$divide": ["$stats.attended", "$stats.totalClasses"] }, 100] }, 0] } } },
        { "$sort": { "attendancePercentage": 1 } }, { "$limit": limit },
        { "$project": { "name": 1, "studentID": 1, "stream": 1, "semester": 1, "attendancePercentage": { "$round": ["$attendancePercentage", 1] }, "classesAttended": "$stats.attended", "totalClasses": "$stats.totalClasses" } }
      ],
      explanation: `Bottom ${limit} students by attendance`
    };
  }

  // =========== SUBJECT-WISE DEFAULTERS / LOW ATTENDANCE ===========
  if (lowerQuestion.match(/subject\s*(?:wise|based|by)|per\s*subject/i) &&
    lowerQuestion.match(/low|below|less|default|shortage|poor|75|absent|\bunder\b/i)) {

    const stream = detectedStream;
    const semester = detectedSemester;

    if (stream && semester) {
      console.log(`📊 [Pre-built] Subject-wise defaulters for ${stream} Sem ${semester}`);
      return {
        collection: 'students',
        operation: 'subjectWiseDefaulters',
        query: { stream, semester },
        explanation: `Subject-wise attendance (below 75%) for ${stream} Semester ${semester}`
      };
    }
  }

  // =========== DEFAULTERS / LOW ATTENDANCE ===========
  if (lowerQuestion.match(/low\s*attendance|below\s*75|less\s*than\s*75|defaulter|shortage|poor\s*attendance/i)) {
    const matchFilter = { isActive: true };
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "students", operation: "aggregate",
      query: [
        { "$match": matchFilter },
        { "$lookup": { "from": "attendance", "let": { "studentID": "$studentID", "stream": "$stream", "semester": "$semester" }, "pipeline": [{ "$match": { "$expr": { "$and": [{ "$eq": ["$stream", "$$stream"] }, { "$eq": ["$semester", "$$semester"] }] } } }, { "$group": { "_id": null, "totalClasses": { "$sum": 1 }, "attended": { "$sum": { "$cond": [{ "$in": ["$$studentID", "$studentsPresent"] }, 1, 0] } } } }], "as": "stats" } },
        { "$unwind": { "path": "$stats", "preserveNullAndEmptyArrays": true } },
        { "$addFields": { "attendancePercentage": { "$cond": [{ "$gt": [{ "$ifNull": ["$stats.totalClasses", 0] }, 0] }, { "$multiply": [{ "$divide": ["$stats.attended", "$stats.totalClasses"] }, 100] }, 0] } } },
        { "$match": { "attendancePercentage": { "$lt": 75 } } },
        { "$project": { "name": 1, "studentID": 1, "stream": 1, "semester": 1, "attendancePercentage": { "$round": ["$attendancePercentage", 1] }, "classesAttended": "$stats.attended", "totalClasses": "$stats.totalClasses" } },
        { "$sort": { "attendancePercentage": 1 } }
      ],
      explanation: `Students below 75% attendance`
    };
  }

  // =========== STUDENT LIST ===========
  if (lowerQuestion.match(/^(?:list|show|get|all|find)\s*(?:all\s*)?(?:the\s*)?students?|students?\s+(?:from|in|of)\s+/i)) {
    const query = { isActive: true };
    if (detectedStream) query.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) query.semester = detectedSemester;
    return { collection: "students", operation: "find", query, explanation: `Student list` };
  }

  // =========== STUDENT COMPARISON ===========
  const compMatch = lowerQuestion.match(/(?:compare|versus|vs|check)\s+([a-zA-Z0-9\s]+?)\s+(?:with|to|against|and)?\s*(?:average|mean|class|overall)/i);
  if (compMatch && compMatch[1]) {
    const sName = compMatch[1].trim().replace(/^(?:the|student|named|his|her|this)\s+/i, '');
    if (sName.length > 2 && !['bca', 'bba', 'bcom', 'sem', 'semester', 'today', 'all'].includes(sName.toLowerCase())) {
      return buildStudentComparisonQuery(sName);
    }
  }

  // =========== STUDENT ATTENDANCE REPORT ===========
  const match1 = lowerQuestion.match(/(?:attendance|report|classes|sessions).*?(?:of|for|by|student|named?|has)\s+([a-zA-Z0-9\s]+?)(?:\?|$)/i);
  const match2 = lowerQuestion.match(/(?:what\s+is|show|get|find|tell\s+me\s+about)?\s*([a-zA-Z0-9\s]{3,30}?)(?:'s\s+|\s+)(?:attendance|report|profile|details|info)/i);

  let studentName = null;
  const skipWords = ['show', 'get', 'list', 'find', 'display', 'view', 'give', 'today', 'all', 'total', 'class', 'daily', 'bca', 'bba', 'bcom', 'bda', 'mca', 'mba', 'the', 'my', 'sem', 'semester'];

  if (match1 && match1[1]) {
    studentName = match1[1].trim();
  } else if (match2 && match2[1]) {
    const candidate = match2[1].trim();
    const firstWord = candidate.split(' ')[0].toLowerCase();
    if (!skipWords.includes(firstWord)) studentName = candidate;
  }

  if (studentName) {
    studentName = studentName.replace(/\s+attended$/i, '').trim();
    studentName = studentName.replace(/^(?:what about|show me|find|get|the|a|an|student|has|attended|what is|detail|info|details)\s+/i, '').trim();
    const firstWord = studentName.split(' ')[0].toLowerCase();
    if (studentName.length > 2 && !skipWords.includes(firstWord) && !studentName.match(/^(bca|bba|bcom|bda|mca|mba)\b/i)) {
      return buildStudentAttendanceQuery(studentName, parsedDate);
    }
  }

  // =========== DATE-BASED ATTENDANCE ===========
  if (parsedDate || lowerQuestion.includes('today') || lowerQuestion.includes('yesterday')) {
    const dateToUse = parsedDate || (lowerQuestion.includes('yesterday')
      ? new Date(Date.now() - 86400000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]);

    if (lowerQuestion.match(/attendance|class|session/i)) {
      const query = { "date": { "$regex": `^${dateToUse}` } };
      if (detectedStream) query.stream = detectedStream;
      if (detectedSemester) query.semester = detectedSemester;
      return {
        collection: "attendance", operation: "find", query,
        projection: { "subject": 1, "stream": 1, "semester": 1, "teacherName": 1, "presentCount": 1, "absentCount": 1, "totalStudents": 1, "time": 1, "date": 1 },
        explanation: `Attendance for ${dateToUse}`
      };
    }
  }

  // =========== SUBJECT LIST ===========
  if (lowerQuestion.match(/subjects|curriculum|syllabus|papers/i)) {

    // Check if asking about a specific student's subjects
    const studentSubjectMatch = question.match(
      /(?:show|get|find|list|what are)?\s*(.+?)(?:'s|s')\s+subjects?/i
    );

    if (studentSubjectMatch && studentSubjectMatch[1]) {
      const sName = studentSubjectMatch[1].trim()
        .replace(/^(?:show|get|find|list|what are|the|a|an)\s+/i, '').trim();

      const skipWords = ['all', 'bca', 'bba', 'bcom', 'mca', 'mba', 'bda', 'today', 'list', 'show', 'get'];
      const firstWord = sName.split(' ')[0].toLowerCase();

      if (sName.length > 2 && !skipWords.includes(firstWord)) {
        console.log(`🎯 [Subjects] Student name detected: "${sName}"`);

        try {
          const db = getDB();

          // Build smart regex for names with initials like "Pruthvi M U"
          const words = sName.split(/\s+/).filter(w => w.length > 0);
          const regex = words.length > 1
            ? words.map(w => `(?=.*${w})`).join('')
            : sName;

          console.log(`🔍 [Subjects] Searching student with regex: "${regex}"`);

          const student = await db.collection('students').findOne({
            name: { $regex: regex, $options: 'i' },
            isActive: true
          });

          if (student) {
            console.log(`✅ [Subjects] Found: ${student.name} — ${student.stream} Sem ${student.semester}`);
            return {
              collection: "subjects",
              operation: "find",
              query: {
                stream: student.stream,
                semester: student.semester,
                isActive: true
              },
              projection: { name: 1, subjectCode: 1, stream: 1, semester: 1, subjectType: 1 },
              explanation: `Subjects for ${student.name} (${student.stream} Sem ${student.semester})`
            };
          } else {
            console.log(`⚠️ [Subjects] Student "${sName}" not found — falling back to stream/sem filter`);
          }
        } catch (e) {
          console.log(`⚠️ [Subjects] Student lookup error:`, e.message);
        }
      }
    }

    // Generic subject list — filtered by stream/semester if detected
    const query = { isActive: true };
    if (detectedStream) query.stream = detectedStream;
    if (detectedSemester) query.semester = detectedSemester;
    return {
      collection: "subjects", operation: "find", query,
      projection: { name: 1, subjectCode: 1, stream: 1, semester: 1, subjectType: 1 },
      explanation: `Subject list${detectedStream ? ` for ${detectedStream}` : ''}${detectedSemester ? ` Sem ${detectedSemester}` : ''}`
    };
  }
  // =========== RECENT CLASSES ===========
  if (lowerQuestion.match(/recent\s*(?:classes|sessions|lectures)|last\s*(?:\d+\s*)?(?:classes|sessions|lectures)/i)) {
    const limitMatch = lowerQuestion.match(/last\s*(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 10;
    const matchFilter = {};
    if (detectedStream) matchFilter.stream = { $regex: `^${detectedStream}$`, $options: 'i' };
    if (detectedSemester) matchFilter.semester = detectedSemester;
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$match": matchFilter }, { "$sort": { "date": -1 } }, { "$limit": limit },
        { "$project": { "_id": 0, "date": 1, "time": 1, "subject": 1, "stream": 1, "semester": 1, "teacherName": 1, "presentCount": 1, "totalStudents": 1, "absentCount": 1 } }
      ],
      explanation: `Last ${limit} classes`
    };
  }

  // =========== STUDENTS WITH NO MENTOR ===========
  if (lowerQuestion.match(/(?:students?|all)\s+(?:with|having)\s+no\s+(?:assigned\s+)?mentor|not\s+(?:assigned|mentored)/i)) {
    return { collection: "students", operation: "find", query: { "$or": [{ "mentorEmail": null }, { "mentorEmail": { "$exists": false } }], "isActive": true }, projection: { name: 1, studentID: 1, stream: 1, semester: 1, _id: 0 }, explanation: `Students without mentor` };
  }

  // =========== MOST ACTIVE TEACHER ===========
  if (lowerQuestion.match(/most\s+(?:active|classes|sessions)|top\s+teacher|teacher\s+ranking/i)) {
    return {
      collection: "attendance", operation: "aggregate",
      query: [
        { "$group": { "_id": "$teacherEmail", "totalClasses": { "$sum": 1 }, "subjects": { "$addToSet": "$subject" }, "totalPresent": { "$sum": "$presentCount" }, "totalStudents": { "$sum": "$totalStudents" } } },
        { "$project": { "_id": 0, "teacherEmail": "$_id", "totalClasses": 1, "subjects": 1, "avgAttendance": { "$cond": [{ "$gt": ["$totalStudents", 0] }, { "$round": [{ "$multiply": [{ "$divide": ["$totalPresent", "$totalStudents"] }, 100] }, 1] }, 0] } } },
        { "$sort": { "totalClasses": -1 } }, { "$limit": 10 }
      ],
      explanation: `Most active teachers`
    };
  }

  // =========== GROQ FALLBACK ===========
  console.log(`🤖 [Fallback] No pattern matched — sending to Groq`);

  const schemaContext = getSchemaContext();
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];

  const prompt = `${schemaContext}

CURRENT DATE: ${currentDate}
USER QUESTION: "${question}"
${parsedDate ? `DETECTED DATE: ${parsedDate}` : ''}
${detectedStream ? `DETECTED STREAM: ${detectedStream}` : ''}
${detectedSemester ? `DETECTED SEMESTER: ${detectedSemester}` : ''}

Generate the MongoDB query JSON for this question. Output ONLY valid JSON:`;

  try {
    const response = await aiService.generateQuery(prompt);
    console.log(`📦 [Groq] Response: ${response.length} chars`);

    let cleaned = response.replace(/```json/gi, '').replace(/```\s*/g, '').replace(/^[^{]*/, '').replace(/[^}]*$/, '').trim();

    let depth = 0, startIdx = -1, endIdx = -1;
    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === '{') { if (depth === 0) startIdx = i; depth++; }
      else if (cleaned[i] === '}') { depth--; if (depth === 0 && startIdx !== -1) { endIdx = i; break; } }
    }

    let jsonStr = startIdx !== -1 && endIdx !== -1
      ? cleaned.substring(startIdx, endIdx + 1)
      : (cleaned.match(/\{[\s\S]*\}/) || [''])[0];

    if (!jsonStr) throw new Error('No valid JSON in Groq response');

    let parsedQuery;
    try {
      parsedQuery = JSON.parse(jsonStr);
    } catch (e) {
      const fixed = jsonStr.replace(/,(\s*[}\]])/g, '$1');
      parsedQuery = JSON.parse(fixed);
    }

    if (!parsedQuery.collection || !parsedQuery.operation) {
      throw new Error('Query missing required fields');
    }

    console.log(`✅ [Groq Query] collection=${parsedQuery.collection} operation=${parsedQuery.operation}`);
    return parsedQuery;

  } catch (error) {
    console.error(`❌ [Groq Fallback Failed]:`, error.message);
    throw new Error(`Failed to generate query: ${error.message}`);
  }
}

// ============================================================================
// GENERATE NATURAL INTRO
// ============================================================================

function generateNaturalIntro(question, results, collection) {
  const prefixes = [
    "Here's what I found! 😊\n\n",
    "I looked that up for you. Here are the details:\n\n",
    "Here is the information you requested:\\n\\n",
    "Got it! Here's what I pulled from the system: ✨\n\n"
  ];
  const p = prefixes[Math.floor(Math.random() * prefixes.length)];

  if (typeof results === 'number') {
    return `${p}Total count of ${collection} matching your query: **${results}**`;
  }
  const count = Array.isArray(results) ? results.length : 1;

  if (collection === 'students') {
    if (count === 0) return "Hmm, I couldn't find any students matching your search. Could you check the spelling?";
    if (count === 1) {
      const s = results[0];
      return `${p}Found student **${s.name || 'Unknown'}**${s.stream && s.semester ? ` — ${s.stream} Semester ${s.semester}` : ''}.`;
    }
    return `${p}Found **${count} students** matching your query.`;
  }
  if (collection === 'teachers') {
    if (count === 0) return "I couldn't find any teachers matching your search. Try another name!";
    if (count === 1) return `${p}Found teacher **${results[0].name || 'Unknown'}**.`;
    return `${p}Found **${count} teachers**.`;
  }
  if (collection === 'subjects') {
    if (count === 0) return "Hmm, I couldn't find any subjects for that search.";
    return `${p}Found **${count} subject${count !== 1 ? 's' : ''}**.`;
  }
  if (collection === 'attendance') {
    if (count === 0) return "No attendance records found. Classes might not be recorded yet!";
    const totalPresent = results.reduce((s, r) => s + (r.presentCount || 0), 0);
    const totalStudents = results.reduce((s, r) => s + (r.totalStudents || 0), 0);
    const avg = totalStudents > 0 ? ((totalPresent / totalStudents) * 100).toFixed(1) : '0';
    return `${p}Found **${count} session${count !== 1 ? 's' : ''}** with **${avg}%** average attendance.`;
  }
  return `${p}Found **${count} record${count !== 1 ? 's' : ''}**.`;
}

// ============================================================================
// FORMAT AS TABLE
// ============================================================================

function formatAsTable(results, collection, question) {
  if (!Array.isArray(results) || results.length === 0) return null;

  const lowerQ = question.toLowerCase();
  const firstItem = results[0];

  const intro = generateNaturalIntro(question, results, collection);
  let table = `${intro}\n\n`;

  // Absent students
  if (firstItem.missedSubjects && Array.isArray(firstItem.missedSubjects)) {
    table += `| # | Student ID | Name | Stream | Sem | Missed Subjects | Count |\n`;
    table += `|---|------------|------|--------|-----|-----------------|-------|\n`;
    results.slice(0, 100).forEach((s, i) => {
      table += `| ${i + 1} | ${(s.studentID || '-').substring(0, 14)} | ${(s.name || '-').substring(0, 18)} | ${s.stream || '-'} | ${s.semester || '-'} | ${s.missedSubjects.join(', ').substring(0, 40)} | ${s.missedCount || 0} |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    return table;
  }

  // Present students
  if (firstItem.attendedSubjects && Array.isArray(firstItem.attendedSubjects)) {
    table += `| # | Student ID | Name | Stream | Sem | Attended | Count |\n`;
    table += `|---|------------|------|--------|-----|----------|-------|\n`;
    results.slice(0, 100).forEach((s, i) => {
      table += `| ${i + 1} | ${(s.studentID || '-').substring(0, 14)} | ${(s.name || '-').substring(0, 18)} | ${s.stream || '-'} | ${s.semester || '-'} | ${s.attendedSubjects.join(', ').substring(0, 40)} | ${s.attendedCount || 0} |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    return table;
  }

  // Individual student attendance (per subject)
  if (firstItem.studentID && firstItem.subject && firstItem.attendancePercentage !== undefined) {
    const uniqueIDs = new Set(results.map(r => r.studentID)).size;
    if (uniqueIDs === 1) {
      const hasClassAvg = results[0].classAverage !== undefined;
      const sName = results[0].studentName || results[0].name || results[0].studentID;
      if (hasClassAvg) {
        table = `### Attendance Comparison: **${sName}**\n\n`;
        table += `| # | Subject | Attended | Total | Student % | Class Avg | Diff | Status |\n`;
        table += `|---|---------|----------|-------|-----------|-----------|------|--------|\n`;
      } else {
        table = `### Attendance Report: **${sName}**\n\n`;
        table += `| # | Subject | Attended | Total | % | Status |\n`;
        table += `|---|---------|----------|-------|---|--------|\n`;
      }
      const sorted = [...results].sort((a, b) => (a.attendancePercentage || 0) - (b.attendancePercentage || 0));
      sorted.forEach((row, i) => {
        const pct = (row.attendancePercentage || 0).toFixed(1);
        const pctNum = parseFloat(pct);
        const status = pctNum >= 90 ? '🟢 Excellent' : pctNum >= 75 ? '🟢 Good' : pctNum >= 50 ? '🟡 Low' : '🔴 Critical';
        if (hasClassAvg) {
          const diff = (pctNum - (row.classAverage || 0)).toFixed(1);
          table += `| ${i + 1} | ${(row.subject || '-').substring(0, 30)} | ${row.classesAttended || 0}/${row.totalClasses || 0} | ${row.totalClasses || 0} | **${pct}%** | ${(row.classAverage || 0).toFixed(1)}% | ${diff >= 0 ? '+' : ''}${diff}% | ${status} |\n`;
        } else {
          table += `| ${i + 1} | ${(row.subject || '-').substring(0, 30)} | ${row.classesAttended || 0}/${row.totalClasses || 0} | ${row.totalClasses || 0} | ${pct}% | ${status} |\n`;
        }
      });
      return table;
    }
  }

  // Attendance ranking / defaulters
  if (firstItem.attendancePercentage !== undefined && firstItem.studentID) {
    const isBelow75 = lowerQ.match(/below\s*75|less\s*than\s*75|defaulter|shortage/i);
    if (isBelow75) table = `Found **${results.length} defaulters** (below 75%). Sorted by lowest attendance:\n\n`;
    else if (lowerQ.match(/top|best|highest/i)) table = `### Top Performers by Attendance\n\n`;
    else if (lowerQ.match(/bottom|worst|lowest/i)) table = `### Bottom Performers by Attendance\n\n`;
    else table = `${intro}\n\n`;

    table += `| # | Student ID | Name | Stream | Sem | Att% | Classes | Status |\n`;
    table += `|---|------------|------|--------|-----|------|---------|--------|\n`;
    results.slice(0, 100).forEach((s, i) => {
      const pct = (s.attendancePercentage || 0).toFixed(1);
      const pctNum = parseFloat(pct);
      const status = pctNum >= 90 ? '🟢 Excellent' : pctNum >= 75 ? '🟢 Good' : pctNum >= 60 ? '🟡 Average' : pctNum >= 50 ? '🟡 Low' : '🔴 Critical';
      table += `| ${i + 1} | ${(s.studentID || '-').substring(0, 14)} | ${(s.name || '-').substring(0, 18)} | ${s.stream || '-'} | ${s.semester || '-'} | ${pct}% | ${s.classesAttended || 0}/${s.totalClasses || 0} | ${status} |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    if (isBelow75) {
      const critical = results.filter(s => s.attendancePercentage < 50).length;
      table += `\n| Metric | Count |\n|--------|-------|\n| Total Defaulters | ${results.length} |\n| Critical (<50%) | ${critical} |\n| Low (50-74%) | ${results.length - critical} |\n`;
    }
    return table;
  }

  // Students list
  if (collection === 'students' || (firstItem.studentID && firstItem.name && !firstItem.email)) {
    if (results.length === 1) return null;
    table += `| # | ID | Name | Stream | Sem | Mentor | Phone |\n`;
    table += `|---|----|----|--------|-----|--------|-------|\n`;
    results.slice(0, 100).forEach((s, i) => {
      const mentor = s.mentorName || (s.mentorEmail ? s.mentorEmail.split('@')[0] : 'Not Assigned');
      table += `| ${i + 1} | ${(s.studentID || 'N/A').substring(0, 12)} | ${(s.name || 'N/A').substring(0, 18)} | ${s.stream || 'N/A'} | ${s.semester != null ? s.semester : 'N/A'} | ${mentor} | ${s.parentPhone || 'N/A'} |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    return table;
  }

  // Subjects list
  if (collection === 'subjects' || (firstItem.name && firstItem.subjectCode)) {
    if (results.length === 1) return null;
    table += `| # | Subject | Code | Stream | Sem | Type |\n`;
    table += `|---|---------|------|--------|-----|------|\n`;
    results.slice(0, 100).forEach((s, i) => {
      table += `| ${i + 1} | ${(s.name || '-').substring(0, 25)} | ${(s.subjectCode || '-').substring(0, 10)} | ${s.stream || '-'} | ${s.semester || '-'} | ${s.subjectType === 'CORE' ? 'Core' : 'Elec'} |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    return table;
  }

  // Attendance records
  if (collection === 'attendance' || (firstItem.subject && firstItem.date)) {
    if (firstItem.avgPercentage !== undefined) {
      table = `### Attendance Overview\n\n`;
      table += `| # | Label | Sessions | Avg Att% | Status |\n`;
      table += `|---|-------|----------|----------|--------|\n`;
      results.forEach((s, i) => {
        table += `| ${i + 1} | ${s._id || '-'} | ${s.totalSessions || 0} | ${(s.avgPercentage || 0).toFixed(1)}% | ${(s.avgPercentage || 0) >= 75 ? '✓ Good' : '⚠ Low'} |\n`;
      });
      return table;
    }

    table += `| # | Subject | Stream | Sem | Date | Present | Absent | Att% |\n`;
    table += `|---|---------|--------|-----|------|---------|--------|------|\n`;
    results.slice(0, 100).forEach((a, i) => {
      const pct = a.totalStudents > 0 ? ((a.presentCount / a.totalStudents) * 100).toFixed(1) : '0';
      const date = a.date ? new Date(a.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
      table += `| ${i + 1} | ${(a.subject || '-').substring(0, 22)} | ${a.stream || '-'} | ${a.semester || '-'} | ${date} | ${a.presentCount || '-'} | ${a.absentCount || (a.totalStudents - a.presentCount) || '-'} | ${pct}% |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    const totalP = results.reduce((s, r) => s + (r.presentCount || 0), 0);
    const totalS = results.reduce((s, r) => s + (r.totalStudents || 0), 0);
    const avg = totalS > 0 ? ((totalP / totalS) * 100).toFixed(1) : '0';
    table += `\n| Sessions | Average Attendance | Total Present |\n|----------|--------------------|---------------|\n| ${results.length} | ${avg}% | ${totalP}/${totalS} |\n`;
    return table;
  }

  // Teachers list
  if (collection === 'teachers' || (firstItem.email && !firstItem.studentID)) {
    if (results.length === 1) return null;
    table += `| # | Name | Email | Subjects |\n`;
    table += `|---|------|-------|----------|\n`;
    results.slice(0, 100).forEach((t, i) => {
      table += `| ${i + 1} | ${(t.name || '-').substring(0, 25)} | ${(t.email || '-').substring(0, 35)} | ${(t.createdSubjects || []).length} |\n`;
    });
    if (results.length > 100) table += `\n*+${results.length - 100} more*\n`;
    return table;
  }

  return table;
}

// ============================================================================
// FORMAT ATTENDANCE REPORT
// ============================================================================

function formatAttendanceReport(data) {
  if (!data || data.length === 0) return "No attendance data found for this student.";

  const student = data[0];
  const totalClasses = data.reduce((s, r) => s + (r.totalClasses || 0), 0);
  const totalAttended = data.reduce((s, r) => s + (r.classesAttended || 0), 0);
  const overallPct = totalClasses > 0 ? ((totalAttended / totalClasses) * 100).toFixed(1) : '0.0';
  const pct = parseFloat(overallPct);
  const shortages = data.filter(s => (s.attendancePercentage || 0) < 75);
  const sorted = [...data].sort((a, b) => (a.attendancePercentage || 0) - (b.attendancePercentage || 0));
  const statusIcon = pct >= 75 ? '✅' : pct >= 50 ? '⚠️' : '🔴';

  let response = `${statusIcon} **${student.studentName}** — **${overallPct}%** overall attendance\n`;
  response += `> ${student.stream} Sem ${student.semester} • ${totalAttended}/${totalClasses} classes • ${shortages.length > 0 ? `${shortages.length} subject${shortages.length > 1 ? 's' : ''} below 75%` : 'All subjects above 75%'}\n\n`;

  response += `| Subject | Attended | % | Status |\n`;
  response += `|---------|:--------:|:---:|:------:|\n`;

  sorted.forEach(s => {
    const sPct = (s.attendancePercentage || 0).toFixed(1);
    const pctNum = parseFloat(sPct);
    const status = pctNum >= 90 ? '🟢 Excellent' : pctNum >= 75 ? '🟢 Good' : pctNum >= 50 ? '🟡 Low' : '🔴 Critical';
    response += `| ${s.subject || 'Unknown'} | ${s.classesAttended || 0}/${s.totalClasses || 0} | ${sPct}% | ${status} |\n`;
  });

  if (shortages.length > 0) {
    const worst = sorted[0];
    const needed = Math.max(0, Math.ceil((75 * (worst.totalClasses || 0) - 100 * (worst.classesAttended || 0)) / 25));
    response += `\n⚠️ **Focus on ${worst.subject}** — needs ${needed} more classes to reach 75%.`;
  }

  const stuName = (student.studentName || '').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  response += `\n\n**💡 Suggested Follow-ups:**\n- *Who is ${stuName}'s mentor?*\n- *Compare ${stuName} with average*`;

  return response;
}

// ============================================================================
// GENERATE NATURAL RESPONSE
// ============================================================================

async function generateNaturalResponse(question, results, queryInfo) {
  const collection = queryInfo.collection;
  const isSingle = Array.isArray(results) ? results.length === 1 : false;

  let suggestions = '';
  if (collection === 'students' && Array.isArray(results) && results.length > 0) {
    const first = results[0];
    const stream = first.stream || 'BCA';
    const sem = first.semester ? ` Sem ${first.semester}` : '';
    const uniqueIDs = new Set(results.filter(r => r?.studentID).map(r => r.studentID));
    const isIndividual = uniqueIDs.size === 1;

    if (isIndividual || isSingle) {
      const rawName = first.studentName || first.name || '';
      const stuName = rawName ? rawName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'this student';
      const questionLower = question.toLowerCase();
      if (!questionLower.includes('attendance') && !questionLower.includes('report')) {
        suggestions = `\n\n**💡 Suggested Follow-ups:**\n- *What is ${stuName}'s attendance?*\n- *Who is ${stuName}'s mentor?*`;
      } else {
        suggestions = `\n\n**💡 Suggested Follow-ups:**\n- *Who is ${stuName}'s mentor?*\n- *Compare ${stuName} with average*`;
      }
    } else {
      suggestions = `\n\n**💡 Suggested Follow-ups:**\n- *Top 5 in ${stream}${sem}*\n- *Defaulters in ${stream}${sem}*`;
    }
  } else if (collection === 'teachers' && isSingle) {
    const teachName = (results[0].name || 'teacher').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    suggestions = `\n\n**💡 Suggested Follow-ups:**\n- *What subjects does ${teachName} teach?*\n- *Show mentees of ${teachName}*`;
  }

  if (!queryInfo.collection || queryInfo.collection === null) {
    return queryInfo.explanation || "Hello! I can help with student records, attendance, teachers, and subjects.";
  }

  if (queryInfo.operation === 'countDocuments') {
    return `## Total: **${results}**\n\n${generateNaturalIntro(question, results, collection)}` + suggestions;
  }

  // Who teaches query
  const lowerQ = question.toLowerCase();
  if (collection === 'teachers' && lowerQ.match(/who\s+teaches|teacher\s+(?:of|for)/i) && Array.isArray(results)) {
    if (results.length === 0) return "No teacher found for that subject.";
    const t = results[0];
    return `**${t.name}** teaches that subject.\n\n**Email:** ${t.email}${t.phone ? `\n**Phone:** ${t.phone}` : ''}` + suggestions;
  }

  // Mentor query
  if (lowerQ.match(/mentor/i) && collection === 'teachers' && Array.isArray(results) && results.length > 0) {
    const studentMatch = lowerQ.match(/mentor\s+(?:for|of)\s+([^?]+)/i);
    const sName = (studentMatch ? studentMatch[1].trim() : '').toLowerCase();
    for (const teacher of results) {
      if (!teacher.mentees) continue;
      const mentee = teacher.mentees.find(m => (m.name || '').toLowerCase().includes(sName));
      if (mentee) {
        return `**${teacher.name}** is the mentor for **${mentee.name}** (${mentee.studentID}).\n\n**Contact:** ${teacher.email}${teacher.phone ? ` | ${teacher.phone}` : ''}` + suggestions;
      }
    }
  }

  // Mentees list
  if (collection === 'teachers' && lowerQ.match(/mentees|assigned\s+students/i) && isSingle) {
    const teacher = results[0];
    const mentees = teacher.mentees || [];
    if (mentees.length === 0) return `**${teacher.name}** has no mentees assigned.` + suggestions;
    let r = `**${teacher.name}** mentors **${mentees.length} students**:\n\n`;
    mentees.forEach((m, i) => { r += `${i + 1}. **${m.name}** (${m.studentID}) — ${m.stream} Sem ${m.semester}\n`; });
    return r + suggestions;
  }

  // Table format
  const tableFormat = formatAsTable(results, collection, question);
  if (tableFormat) return tableFormat + suggestions;

  // AI fallback for single records / complex data
  return await generateAIResponse(question, results, queryInfo) + suggestions;
}

// ============================================================================
// AI RESPONSE - FOR SINGLE RECORDS / COMPLEX DATA
// ============================================================================

async function generateAIResponse(question, results, queryInfo) {
  const intro = generateNaturalIntro(question, results, queryInfo.collection);
  const resultCount = Array.isArray(results) ? results.length : 1;

  if (resultCount === 1) {
    const item = results[0] || results;

    // Student profile
    if (item.studentID && item.name) {
      let r = `**${item.name}**\n\n**Student Details:**\n`;
      r += `- **ID:** ${item.studentID}\n`;
      r += `- **Stream:** ${item.stream || 'N/A'}\n`;
      r += `- **Semester:** ${item.semester || 'N/A'}\n`;
      if (item.academicYear) r += `- **Academic Year:** ${item.academicYear}\n`;
      if (item.languageSubject) r += `- **Language Subject:** ${item.languageSubject}\n`;
      if (item.electiveSubject) r += `- **Elective Subject:** ${item.electiveSubject}\n`;
      if (item.parentPhone) r += `\n**Parent Phone:** ${item.parentPhone}\n`;
      const mentor = item.mentorName || (item.mentorEmail ? item.mentorEmail.split('@')[0].split('.').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ') : null);
      r += mentor ? `\n**Mentor:** ${mentor}\n` : `\n*No mentor assigned yet.*\n`;
      return r;
    }

    // Teacher profile
    if (item.email && (item.createdSubjects || item.mentees || item.department)) {
      let r = `**${item.name || 'Teacher'}**\n\n`;
      r += `- **Email:** ${item.email}\n`;
      if (item.phone) r += `- **Phone:** ${item.phone}\n`;
      if (item.department) r += `- **Department:** ${item.department}\n`;
      if (item.createdSubjects?.length > 0) {
        r += `\n**Subjects (${item.createdSubjects.length}):**\n`;
        item.createdSubjects.forEach((s, i) => { r += `${i + 1}. ${s.subject || '?'} — ${s.stream || '?'} Sem ${s.semester || '?'}\n`; });
      }
      if (item.mentees?.length > 0) {
        r += `\n**Mentees (${item.mentees.length}):**\n`;
        item.mentees.forEach((m, i) => { r += `${i + 1}. ${m.name} (${m.studentID}) — ${m.stream} Sem ${m.semester}\n`; });
      }
      return r;
    }

    // Subject profile
    if (item.subjectCode || (item.name && item.stream && item.semester && !item.studentID)) {
      let r = `**${item.name}**\n\n`;
      if (item.subjectCode) r += `- **Code:** ${item.subjectCode}\n`;
      r += `- **Stream:** ${item.stream || 'N/A'}\n`;
      r += `- **Semester:** ${item.semester || 'N/A'}\n`;
      if (item.subjectType) r += `- **Type:** ${item.subjectType}\n`;
      if (item.teacherAssigned) r += `- **Teacher:** ${item.teacherAssigned}\n`;
      return r;
    }
  }

  // Groq for anything else
  const prompt = `Format this data clearly using markdown. Use ONLY the exact values provided. Never invent any data.

USER ASKED: "${question}"
DATA: ${JSON.stringify(Array.isArray(results) ? results.slice(0, 5) : results, null, 2)}

Use bold for field names, lists for multiple items, headers for sections. Skip _id and __v fields.`;

  try {
    return await aiService.generateResponse(prompt);
  } catch (e) {
    return friendlyFormatResults(results, question, queryInfo.collection);
  }
}

// ============================================================================
// FALLBACK FORMATTER
// ============================================================================

function friendlyFormatResults(results, question, collection) {
  if (!results) return "No data found. Please check your search criteria and try again.";
  if (typeof results === 'number') return `## Total: **${results}**`;
  if (!Array.isArray(results) || results.length === 0) {
    return "No records found matching your criteria. Try checking spelling or using broader search terms.";
  }
  const intro = generateNaturalIntro(question, results, collection);
  const tableFormat = formatAsTable(results, collection, question);
  if (tableFormat) return tableFormat;
  return `${intro}\n\n${results.slice(0, 10).map((item, i) =>
    `${i + 1}. ${Object.entries(item).filter(([k, v]) => k !== '_id' && k !== '__v' && v != null).map(([k, v]) => `**${k}:** ${v}`).slice(0, 5).join(' | ')}`
  ).join('\n')}${results.length > 10 ? `\n\n*+${results.length - 10} more records*` : ''}`;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

async function handleLLMChat(message, userId = 'anonymous') {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(60)}\n🚀 CHAT: "${message}" | User: ${userId}\n${'='.repeat(60)}`);

  try {
    const queryInfo = await generateMongoQuery(message);
    const results = await executeQuery(queryInfo);

    let response;
    if (queryInfo.collection === 'students' && queryInfo.operation === 'aggregate' &&
      Array.isArray(results) && results.length > 0 && results[0].attendancePercentage !== undefined &&
      results[0].studentName) {
      response = formatAttendanceReport(results);
    } else {
      response = await generateNaturalResponse(message, results, queryInfo);
    }

    console.log(`✅ DONE in ${Date.now() - startTime}ms`);
    return {
      success: true, response,
      metadata: {
        collection: queryInfo.collection, operation: queryInfo.operation,
        resultCount: Array.isArray(results) ? results.length : (typeof results === 'number' ? results : 1),
        processingTime: `${Date.now() - startTime}ms`, timestamp: new Date(), userId
      }
    };

  } catch (error) {
    console.error(`❌ FAILED: ${error.message}`);
    const msg = error.message;

    if (msg.startsWith('STUDENT_NOT_FOUND:')) {
      return { success: false, error: `Student "${msg.split(':')[1]}" not found`, suggestion: 'Check spelling and try again.' };
    }
    if (msg.startsWith('NO_ATTENDANCE_RECORDS:')) {
      const [, name, stream, sem] = msg.split(':');
      return { success: false, error: 'No attendance records', suggestion: `${name} is in ${stream} Sem ${sem} but no classes have been recorded yet.` };
    }
    if (msg.startsWith('STUDENT_EXISTS_NO_ATTENDANCE:')) {
      const [, name, stream, sem, id] = msg.split(':');
      return { success: false, error: 'No attendance data', suggestion: `${name} (${id}) is registered in ${stream} Sem ${sem} but has no attendance recorded.` };
    }

    return { success: false, error: msg, suggestion: 'Please rephrase your question or try a simpler query.' };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  generateMongoQuery, executeQuery, generateNaturalResponse,
  friendlyFormatResults, formatAttendanceReport, formatAsTable,
  parseDateFromQuery, buildStudentAttendanceQuery, buildStudentComparisonQuery,
  handleLLMChat, generateNaturalIntro, generateAIResponse
};