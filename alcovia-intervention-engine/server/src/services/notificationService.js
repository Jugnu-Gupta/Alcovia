const axios = require('axios');

let missingWebhookWarned = false;

async function triggerMentorNotification(studentId, quizScore, focusMinutes) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    const isPlaceholder = webhookUrl && webhookUrl.includes('your-n8n-instance.com');

    if (!webhookUrl || isPlaceholder) {
        if (!missingWebhookWarned) {
            console.warn('[Notification] Skipping mentor webhook: set N8N_WEBHOOK_URL to a reachable n8n webhook to enable.');
            missingWebhookWarned = true;
        }
        return { skipped: true, message: 'Webhook URL is not configured' };
    }

    try {
        await axios.post(webhookUrl, {
            student_id: studentId,
            quiz_score: quizScore,
            focus_minutes: focusMinutes,
            timestamp: new Date().toISOString()
        });
        console.log('Mentor notification triggered successfully');
        return { success: true };
    } catch (error) {
        const status = error.response?.status;
        const hint = error.response?.data?.hint;
        const message = hint || error.response?.data?.message || error.message;

        if (status && status >= 400 && status < 500) {
            console.warn(
                `[Notification] Mentor webhook responded with ${status}. Continuing without blocking daily check-in. ${message}`
            );
            return {
                skipped: true,
                status,
                message
            };
        }

        console.error('Failed to trigger mentor notification:', error.message);
        throw error;
    }
}

module.exports = {
    triggerMentorNotification
};
