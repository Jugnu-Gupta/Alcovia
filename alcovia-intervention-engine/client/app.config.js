try {
    require('dotenv').config();
} catch (err) {
    if (!process.env.CI && process.env.NODE_ENV !== 'production') {
        console.warn('[Expo] dotenv not loaded:', err.message);
    }
}

module.exports = ({ config }) => ({
    ...config,
    name: 'Alcovia Intervention',
    slug: 'alcovia-intervention-engine',
    version: '1.0.0',
    orientation: 'portrait',
    scheme: 'alcovia',
    platforms: ['ios', 'android', 'web'],
    jsEngine: 'hermes',
    web: {
        bundler: 'metro',
    },
    extra: {
        apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:5000/api',
        studentId: process.env.EXPO_PUBLIC_STUDENT_ID ?? 'student 123',
    },
});
