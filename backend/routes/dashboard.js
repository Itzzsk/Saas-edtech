// routes/dashboardRoutes.js
const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');

// ============================================================================
// MIDDLEWARE
// ============================================================================

const checkDB = (req, res, next) => {
  const db = req.app.locals.db || req.app.get('db');
  if (!db) {
    return res.status(503).json({ 
      success: false, 
      error: 'Database connection not available' 
    });
  }
  req.db = db;
  next();
};

router.use(checkDB);

// ============================================================================
// DASHBOARD STATISTICS
// ============================================================================

// GET Dashboard Overview Stats
router.get('/stats', async (req, res) => {
  try {
    console.log('📊 Fetching dashboard statistics...');
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Fetch all statistics in parallel
    const [
      totalStudents,
      activeStudents,
      totalStreams,
      totalSubjects,
      recentStudents,
      attendanceData
    ] = await Promise.all([
      req.db.collection('students').countDocuments(),
      req.db.collection('students').countDocuments({ isActive: true }),
      req.db.collection('students').distinct('stream', { isActive: true }).then(arr => arr.length),
      req.db.collection('subjects').countDocuments({ isActive: true }),
      req.db.collection('students')
        .find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .toArray(),
      req.db.collection('attendance')
        .find({})
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray()
    ]);

    // Calculate attendance rate
    let attendanceRate = 0;
    let totalPresent = 0;
    let totalMarked = 0;
    
    if (attendanceData.length > 0) {
      attendanceData.forEach(record => {
        const present = record.presentCount || record.studentsPresent?.length || 0;
        const total = record.totalStudents || 0;
        
        totalPresent += present;
        totalMarked += total;
      });
      
      attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0;
    }

    // Stream-wise distribution
    const streamDistribution = await req.db.collection('students')
      .aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$stream', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
      .toArray();

    // Semester-wise distribution
    const semesterDistribution = await req.db.collection('students')
      .aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$semester', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
      .toArray();

    const stats = {
      totalStudents,
      activeStudents,
      inactiveStudents: totalStudents - activeStudents,
      totalStreams,
      totalSubjects,
      attendanceRate,
      recentStudents: recentStudents.slice(0, 5).map(s => ({
        _id: s._id,
        studentID: s.studentID,
        name: s.name,
        stream: s.stream,
        semester: s.semester,
        createdAt: s.createdAt
      })),
      streamDistribution: streamDistribution.map(s => ({
        stream: s._id,
        count: s.count
      })),
      semesterDistribution: semesterDistribution.map(s => ({
        semester: s._id,
        count: s.count
      })),
      timestamp: new Date()
    };

    console.log('✅ Dashboard stats calculated:', {
      students: totalStudents,
      streams: totalStreams,
      subjects: totalSubjects,
      attendanceRate: attendanceRate + '%'
    });

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// RECENT ACTIVITIES
// ============================================================================

// GET Recent Activities
router.get('/activities', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    console.log(`📋 Fetching last ${limit} activities...`);

    // Fetch recent students
    const recentStudents = await req.db.collection('students')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    // Fetch recent attendance records
    const recentAttendance = await req.db.collection('attendance')
      .find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    const activities = [
      ...recentStudents.map(student => ({
        type: 'student_registered',
        title: `${student.name} registered`,
        description: `${student.stream} - Semester ${student.semester}`,
        timestamp: student.createdAt || new Date(),
        badge: 'new',
        avatar: student.name?.substring(0, 2).toUpperCase() || 'ST'
      })),
      ...recentAttendance.map(record => ({
        type: 'attendance_marked',
        title: 'Attendance marked',
        description: `${record.stream || 'N/A'} - ${record.subject || 'N/A'}`,
        timestamp: record.createdAt || new Date(),
        badge: 'completed',
        avatar: 'AT'
      }))
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);

    console.log(`✅ Found ${activities.length} activities`);

    res.json({
      success: true,
      activities,
      count: activities.length
    });

  } catch (error) {
    console.error('❌ Error fetching activities:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// STREAM STATISTICS
// ============================================================================

// GET Stream-wise Statistics
router.get('/streams/stats', async (req, res) => {
  try {
    console.log('📚 Fetching stream-wise statistics...');

    const streamStats = await req.db.collection('students')
      .aggregate([
        { $match: { isActive: true } },
        {
          $group: {
            _id: '$stream',
            totalStudents: { $sum: 1 },
            semesters: { $addToSet: '$semester' }
          }
        },
        { $sort: { totalStudents: -1 } }
      ])
      .toArray();

    const formattedStats = streamStats.map(stat => ({
      stream: stat._id,
      totalStudents: stat.totalStudents,
      semesterCount: stat.semesters.length,
      semesters: stat.semesters.sort()
    }));

    console.log(`✅ Found ${formattedStats.length} streams`);

    res.json({
      success: true,
      streamStats: formattedStats,
      totalStreams: formattedStats.length
    });

  } catch (error) {
    console.error('❌ Error fetching stream stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// ATTENDANCE STATISTICS
// ============================================================================

// GET Attendance Statistics
router.get('/attendance/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    console.log('📈 Fetching attendance statistics...');

    const query = {};
    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = startDate;
      if (endDate) query.date.$lte = endDate;
    }

    const attendanceRecords = await req.db.collection('attendance')
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    let totalPresent = 0;
    let totalAbsent = 0;
    let totalRecords = attendanceRecords.length;

    attendanceRecords.forEach(record => {
      totalPresent += (record.presentCount || record.studentsPresent?.length || 0);
      totalAbsent += (record.absentCount || 0);
    });

    const totalMarked = totalPresent + totalAbsent;
    const attendanceRate = totalMarked > 0 ? ((totalPresent / totalMarked) * 100).toFixed(2) : 0;

    // Daily attendance trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];

    const dailyTrends = await req.db.collection('attendance')
      .aggregate([
        {
          $match: {
            date: { $gte: sevenDaysAgoStr }
          }
        },
        {
          $group: {
            _id: '$date',
            present: { $sum: { $ifNull: ['$presentCount', 0] } },
            absent: { $sum: { $ifNull: ['$absentCount', 0] } }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray();

    console.log(`✅ Found ${totalRecords} attendance records`);

    res.json({
      success: true,
      attendanceStats: {
        totalPresent,
        totalAbsent,
        totalRecords,
        attendanceRate: parseFloat(attendanceRate),
        dailyTrends: dailyTrends.map(d => ({
          date: d._id,
          present: d.present,
          absent: d.absent
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error fetching attendance stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// QUICK SUMMARY
// ============================================================================

// GET Quick Dashboard Summary (for fast loading)
router.get('/summary', async (req, res) => {
  try {
    console.log('⚡ Fetching quick dashboard summary...');

    const [totalStudents, totalStreams, totalSubjects] = await Promise.all([
      req.db.collection('students').countDocuments({ isActive: true }),
      req.db.collection('students').distinct('stream', { isActive: true }).then(arr => arr.length),
      req.db.collection('subjects').countDocuments({ isActive: true })
    ]);

    // Quick attendance rate
    const recentAttendance = await req.db.collection('attendance')
      .find({})
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    let attendanceRate = 0;
    if (recentAttendance.length > 0) {
      const totalPresent = recentAttendance.reduce((sum, r) => sum + (r.presentCount || 0), 0);
      const totalMarked = recentAttendance.reduce((sum, r) => sum + (r.totalStudents || 0), 0);
      attendanceRate = totalMarked > 0 ? Math.round((totalPresent / totalMarked) * 100) : 0;
    }

    console.log('✅ Summary fetched successfully');

    res.json({
      success: true,
      summary: {
        totalStudents,
        totalStreams,
        totalSubjects,
        attendanceRate
      },
      timestamp: new Date()
    });

  } catch (error) {
    console.error('❌ Error fetching summary:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// HEALTH CHECK
// ============================================================================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Dashboard API is running',
    database: req.db ? 'Connected' : 'Disconnected',
    timestamp: new Date()
  });
});

module.exports = router;
