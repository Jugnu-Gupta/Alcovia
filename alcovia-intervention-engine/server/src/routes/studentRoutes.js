const express = require('express');
const {
    getStudentStatus,
    dailyCheckin,
    assignIntervention,
    completeIntervention,
    reportCheat
} = require('../controllers/studentController');

const router = express.Router();

router.get('/health', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

router.get('/student/:id/status', getStudentStatus);
router.post('/daily-checkin', dailyCheckin);
router.post('/assign-intervention', assignIntervention);
router.post('/complete-intervention', completeIntervention);
router.post('/report-cheat', reportCheat);

module.exports = router;
