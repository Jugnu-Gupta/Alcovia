const { query } = require('../config/database');
const { triggerMentorNotification } = require('../services/notificationService');
const { getSocket } = require('../utils/socket');

async function runQuery(sql, params = []) {
    return query(sql, params);
}

async function getQuery(sql, params = []) {
    const result = await query(sql, params);
    return result.rows[0] || null;
}

function emitStudentStatus(studentId, payload) {
    try {
        const io = getSocket();
        io.to(`student_${studentId}`).emit('status_update', payload);
    } catch (socketErr) {
        console.warn('Socket emit skipped:', socketErr.message);
    }
}

async function getStudentStatus(req, res) {
    const studentId = req.params.id;

    try {
        const student = await getQuery('SELECT * FROM students WHERE id = $1', [studentId]);

        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const intervention = await getQuery(
            'SELECT * FROM interventions WHERE student_id = $1 AND status = $2 ORDER BY assigned_at DESC LIMIT 1',
            [studentId, 'pending']
        );

        res.json({
            student,
            intervention: intervention || null
        });
    } catch (err) {
        console.error('Failed to get student status:', err);
        res.status(500).json({ error: 'Database error' });
    }
}

async function dailyCheckin(req, res) {
    const { student_id: studentId, quiz_score: quizScore, focus_minutes: focusMinutes } = req.body;

    if (!studentId || quizScore === undefined || focusMinutes === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const isSuccess = quizScore > 7 && focusMinutes > 60;
    const responseStatus = isSuccess ? 'On Track' : 'Pending Mentor Review';
    const dbStatus = isSuccess ? 'on_track' : 'needs_intervention';

    try {
        await runQuery(
            'INSERT INTO daily_logs (student_id, quiz_score, focus_minutes, status) VALUES ($1, $2, $3, $4)',
            [studentId, quizScore, focusMinutes, dbStatus]
        );

        if (isSuccess) {
            await runQuery(
                'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
                ['normal', studentId]
            );
            emitStudentStatus(studentId, { status: 'normal' });
            return res.json({ status: responseStatus });
        }

        await runQuery(
            'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
            ['needs_intervention', studentId]
        );

        try {
            const notifyResult = await triggerMentorNotification(studentId, quizScore, focusMinutes);
            emitStudentStatus(studentId, { status: 'needs_intervention' });

            if (notifyResult?.skipped) {
                return res.json({ status: responseStatus, warning: notifyResult.message || 'Notification skipped' });
            }

            return res.json({ status: responseStatus });
        } catch (notifyErr) {
            console.error('Mentor notification failed:', notifyErr);
            emitStudentStatus(studentId, { status: 'needs_intervention' });
            return res.json({ status: responseStatus, warning: 'Notification may have failed' });
        }
    } catch (err) {
        console.error('Daily check-in failed:', err);
        res.status(500).json({ error: 'Failed to process daily check-in' });
    }
}

async function assignIntervention(req, res) {
    const { student_id: studentId, task_description: taskDescription } = req.body;

    if (!studentId || !taskDescription) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const insertResult = await runQuery(
            'INSERT INTO interventions (student_id, task_description) VALUES ($1, $2) RETURNING id, task_description, status',
            [studentId, taskDescription]
        );

        await runQuery(
            'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
            ['remedial', studentId]
        );

        const intervention = insertResult.rows[0];
        const payload = {
            status: 'remedial',
            intervention
        };

        emitStudentStatus(studentId, payload);
        res.json({ success: true, intervention_id: intervention.id });
    } catch (err) {
        console.error('Failed to assign intervention:', err);
        res.status(500).json({ error: 'Failed to assign intervention' });
    }
}

async function completeIntervention(req, res) {
    const { student_id: studentId, intervention_id: interventionId } = req.body;

    if (!studentId || !interventionId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const updateResult = await runQuery(
            'UPDATE interventions SET status = $1, completed_at = NOW() WHERE id = $2 AND student_id = $3',
            ['completed', interventionId, studentId]
        );

        if (!updateResult.rowCount) {
            return res.status(404).json({ error: 'Intervention not found' });
        }

        await runQuery(
            'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
            ['normal', studentId]
        );

        emitStudentStatus(studentId, { status: 'normal' });
        res.json({ success: true });
    } catch (err) {
        console.error('Failed to complete intervention:', err);
        res.status(500).json({ error: 'Failed to complete intervention' });
    }
}

async function reportCheat(req, res) {
    const { student_id: studentId, focus_minutes: focusMinutes, reason } = req.body;

    if (!studentId || focusMinutes === undefined) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const statusReason = reason || 'cheated';

    try {
        await runQuery(
            'INSERT INTO daily_logs (student_id, quiz_score, focus_minutes, status) VALUES ($1, $2, $3, $4)',
            [studentId, 0, focusMinutes, statusReason]
        );

        await runQuery(
            'UPDATE students SET status = $1, updated_at = NOW() WHERE id = $2',
            ['needs_intervention', studentId]
        );

        try {
            const notifyResult = await triggerMentorNotification(studentId, 0, focusMinutes);
            emitStudentStatus(studentId, { status: 'needs_intervention' });

            if (notifyResult?.skipped) {
                return res.json({ status: 'Logged cheat (notification skipped)', warning: notifyResult.message });
            }

            return res.json({ status: 'Logged cheat and notified mentor' });
        } catch (notifyErr) {
            console.error('Mentor notification failed:', notifyErr);
            emitStudentStatus(studentId, { status: 'needs_intervention' });
            return res.json({ status: 'Logged cheat (notification may have failed)' });
        }
    } catch (err) {
        console.error('Failed to log cheat:', err);
        res.status(500).json({ error: 'Failed to log cheat' });
    }
}

module.exports = {
    getStudentStatus,
    dailyCheckin,
    assignIntervention,
    completeIntervention,
    reportCheat
};
