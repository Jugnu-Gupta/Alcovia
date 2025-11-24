import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import axios from 'axios';
import Constants from 'expo-constants';
import io from 'socket.io-client';

const extra = Constants.expoConfig?.extra ?? {};
const API_BASE_URL = extra.apiUrl ?? 'http://localhost:5000/api';
const SOCKET_IO_URL = extra.socketUrl ?? 'http://localhost:5000';
const STUDENT_ID = extra.studentId ?? 'student 123';

const STATUS_TEXT = {
  normal: 'All clear',
  needs_intervention: 'Mentor review pending',
  remedial: 'Remedial task assigned'
};

const STATUS_STYLES = {
  normal: 'statusNormal',
  needs_intervention: 'statusLocked',
  remedial: 'statusRemedial'
};

const Button = ({ label, variant = 'primary', disabled = false, onPress, style }) => {
  const labelStyle = [
    styles.buttonLabel,
    variant === 'secondary' && styles.buttonLabelSecondary,
    disabled && styles.buttonLabelDisabled
  ];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.button, styles[variant] ?? styles.primary, disabled && styles.buttonDisabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={labelStyle.filter(Boolean)}>{label}</Text>
    </TouchableOpacity>
  );
};

const App = () => {
  const [studentStatus, setStudentStatus] = useState('normal');
  const [intervention, setIntervention] = useState(null);
  const [quizScore, setQuizScore] = useState('');
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [focusSeconds, setFocusSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [activityLog, setActivityLog] = useState([]);
  const [focusViolation, setFocusViolation] = useState(false);

  const intervalRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const isTimerRunningRef = useRef(false);
  const focusSecondsRef = useRef(0);
  const socketRef = useRef(null);

  const addActivityLog = useCallback((message) => {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setActivityLog((prev) => {
      const next = [{ id: `${Date.now()}`, message, timestamp: time }, ...prev];
      return next.slice(0, 25);
    });
  }, []);

  const formatTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, []);

  const fetchStudentStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(`${API_BASE_URL}/student/${STUDENT_ID}/status`);
      const { student, intervention: activeIntervention } = response.data;
      if (student?.status) {
        setStudentStatus(student.status);
      }
      setIntervention(activeIntervention ?? null);
      addActivityLog('Synced status with mentor loop');
    } catch (error) {
      console.error('Failed to fetch student status:', error);
      addActivityLog('Unable to sync latest status');
      Alert.alert('Sync failed', 'Could not fetch the latest status from the server.');
    } finally {
      setIsLoading(false);
    }
  }, [addActivityLog]);

  const reportCheat = useCallback(
    async (reason) => {
      const focusDuration = formatTime(focusSecondsRef.current);
      try {
        await axios.post(`${API_BASE_URL}/report-cheat`, {
          student_id: STUDENT_ID,
          focus_duration: focusDuration,
          reason
        });
        addActivityLog('Focus violation reported to mentor');
        await fetchStudentStatus();
      } catch (error) {
        console.error('Failed to report cheat:', error);
        addActivityLog('Failed to notify mentor about focus violation');
      }
    },
    [addActivityLog, fetchStudentStatus]
  );

  const handleFocusLoss = useCallback(
    (reason) => {
      if (!isTimerRunningRef.current) {
        return;
      }
      setIsTimerRunning(false);
      isTimerRunningRef.current = false;
      setFocusViolation(true);
      setStudentStatus('needs_intervention');
      setIntervention(null);
      addActivityLog('Focus session interrupted');
      reportCheat(reason);
    },
    [addActivityLog, reportCheat]
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handleVisibility = () => {
        if (document.hidden) {
          handleFocusLoss('window hidden');
        }
      };
      const handleBlur = () => handleFocusLoss('window blurred');

      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('blur', handleBlur);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('blur', handleBlur);
      };
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      const isBackground = nextState === 'background';
      const wasActive = appStateRef.current === 'active';
      appStateRef.current = nextState;
      if (wasActive && isBackground) {
        handleFocusLoss('app backgrounded');
      }
    });

    return () => subscription.remove();
  }, [handleFocusLoss]);

  useEffect(() => {
    focusSecondsRef.current = focusSeconds;
  }, [focusSeconds]);

  useEffect(() => {
    if (!isTimerRunning) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setFocusSeconds((prev) => prev + 1);
      focusSecondsRef.current += 1;
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTimerRunning]);

  useEffect(() => {
    fetchStudentStatus();
  }, [fetchStudentStatus]);

  useEffect(() => {
    const socket = io(SOCKET_IO_URL, {
      transports: ['websocket'],
      autoConnect: true,
      reconnectionAttempts: 10
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      addActivityLog('Connected to mentor loop');
      socket.emit('join_student', STUDENT_ID);
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
      addActivityLog('Socket disconnected, retrying…');
    });

    socket.on('status_update', (payload) => {
      if (payload?.status) {
        setStudentStatus(payload.status);
      }
      if (payload?.intervention) {
        setIntervention(payload.intervention);
      }
      addActivityLog('Mentor updated your status');
    });

    return () => {
      socket.disconnect();
    };
  }, [addActivityLog]);

  const startTimer = useCallback(() => {
    setFocusViolation(false);
    setIsTimerRunning(true);
    isTimerRunningRef.current = true;
    addActivityLog('Focus session started');
  }, [addActivityLog]);

  const stopTimer = useCallback(() => {
    setIsTimerRunning(false);
    isTimerRunningRef.current = false;
    addActivityLog(`Focus session stopped at ${formatTime(focusSecondsRef.current)}`);
  }, [addActivityLog, formatTime]);

  const resetTimer = useCallback(() => {
    setIsTimerRunning(false);
    isTimerRunningRef.current = false;
    setFocusSeconds(0);
    focusSecondsRef.current = 0;
    setFocusViolation(false);
    addActivityLog('Timer reset');
  }, [addActivityLog]);

  const submitDailyCheckin = useCallback(async () => {
    const trimmedScore = quizScore.trim();
    const parsedScore = Number(trimmedScore);

    if (!trimmedScore || Number.isNaN(parsedScore) || parsedScore < 1 || parsedScore > 10) {
      Alert.alert('Invalid score', 'Please enter a number between 1 and 10.');
      return;
    }

    try {
      setIsLoading(true);
      const focusDuration = formatTime(focusSecondsRef.current);
      const response = await axios.post(`${API_BASE_URL}/daily-checkin`, {
        student_id: STUDENT_ID,
        quiz_score: parsedScore,
        focus_duration: focusDuration
      });

      addActivityLog(`Daily check-in submitted (${response.data?.status ?? 'sent'})`);
      setQuizScore('');
      await fetchStudentStatus();
      Alert.alert('Check-in submitted', 'Your mentor will review your progress shortly.');
    } catch (error) {
      console.error('Daily check-in failed:', error);
      addActivityLog('Daily check-in failed');
      Alert.alert('Submission failed', 'Unable to submit your check-in right now.');
    } finally {
      setIsLoading(false);
    }
  }, [addActivityLog, fetchStudentStatus, quizScore]);

  const completeIntervention = useCallback(async () => {
    if (!intervention) {
      return;
    }

    try {
      setIsLoading(true);
      await axios.post(`${API_BASE_URL}/complete-intervention`, {
        student_id: STUDENT_ID,
        intervention_id: intervention.id,
        focus_duration: formatTime(focusSecondsRef.current)
      });

      addActivityLog('Marked remedial task complete');
      setIntervention(null);
      setStudentStatus('normal');
      setFocusViolation(false);
      await fetchStudentStatus();
    } catch (error) {
      console.error('Failed to complete intervention:', error);
      addActivityLog('Failed to complete remedial task');
      Alert.alert('Update failed', 'Could not mark the task as complete.');
    } finally {
      setIsLoading(false);
    }
  }, [addActivityLog, fetchStudentStatus, intervention]);

  const focusLabel = useMemo(() => formatTime(focusSeconds), [focusSeconds, formatTime]);

  const renderActivity = useCallback(({ item }) => (
    <View style={styles.logRow}>
      <Text style={styles.logTimestamp}>{item.timestamp}</Text>
      <Text style={styles.logMessage}>{item.message}</Text>
    </View>
  ), []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.connectionPill}>
          <View
            style={[styles.connectionDot, socketConnected ? styles.connected : styles.disconnected]}
          />
          <Text style={styles.connectionLabel}>
            {socketConnected ? 'Connected to mentor loop' : 'Offline — retrying…'}
          </Text>
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Alcovia Intervention Engine</Text>
          <Text style={styles.subtitle}>Student Focus Mode</Text>
        </View>

        <View style={styles.card}>
          <View style={[styles.statusBadge, styles[STATUS_STYLES[studentStatus]] ?? styles.statusNormal]}>
            <Text style={styles.statusText}>{STATUS_TEXT[studentStatus] ?? 'Status updating…'}</Text>
          </View>

          {studentStatus === 'normal' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Focus Timer</Text>
              <View style={[styles.timerDisplay, focusViolation && styles.timerWarning]}>
                <Text style={styles.timerValue}>{focusLabel}</Text>
              </View>
              <View style={styles.buttonRow}>
                <Button
                  label="Start"
                  variant="primary"
                  onPress={startTimer}
                  disabled={isTimerRunning || isLoading}
                />
                <Button
                  label="Stop"
                  variant="danger"
                  onPress={stopTimer}
                  disabled={!isTimerRunning || isLoading}
                />
                <Button
                  label="Reset"
                  variant="secondary"
                  onPress={resetTimer}
                  disabled={isLoading}
                />
              </View>

              {focusViolation && (
                <View style={styles.warningBox}>
                  <Text style={styles.warningTitle}>Focus violation detected</Text>
                  <Text style={styles.warningBody}>
                    Keep the Alcovia window active during focus sessions. Your mentor has been notified.
                  </Text>
                </View>
              )}

              <View style={styles.sectionDivider} />

              <Text style={styles.sectionTitle}>Daily Quiz Score</Text>
              <Text style={styles.sectionHint}>Enter a score between 1 and 10.</Text>
              <TextInput
                style={styles.input}
                value={quizScore}
                onChangeText={setQuizScore}
                keyboardType="numeric"
                maxLength={2}
                editable={!isLoading}
                placeholder="10"
                placeholderTextColor="#9ca3af"
              />
              <Button
                label={isLoading ? 'Submitting…' : 'Submit Daily Check-in'}
                variant="success"
                onPress={submitDailyCheckin}
                disabled={isLoading}
                style={styles.fullWidthButton}
              />
            </View>
          )}

          {studentStatus === 'needs_intervention' && (
            <View style={styles.sectionCentered}>
              <Text style={styles.lockedEmoji}>🔒</Text>
              <Text style={styles.sectionTitle}>Analysis in progress</Text>
              <Text style={styles.sectionHintCentered}>
                Mentor review in progress. Please wait for instructions.
              </Text>
              {isLoading && <ActivityIndicator color="#6366f1" style={styles.spinner} />}
              <Button
                label="Refresh Status"
                variant="primary"
                onPress={fetchStudentStatus}
                disabled={isLoading}
                style={styles.fullWidthButton}
              />
            </View>
          )}

          {studentStatus === 'remedial' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Remedial Task</Text>
              <View style={styles.taskBox}>
                <Text style={styles.taskLabel}>Task</Text>
                <Text style={styles.taskBody}>{intervention?.task_description}</Text>
              </View>
              <Button
                label={isLoading ? 'Sending…' : 'Mark Complete'}
                variant="success"
                onPress={completeIntervention}
                disabled={isLoading}
                style={styles.fullWidthButton}
              />
            </View>
          )}

          {activityLog.length > 0 && (
            <View style={styles.logSection}>
              <Text style={styles.sectionTitle}>Recent Activity</Text>
              <FlatList
                data={activityLog}
                keyExtractor={(item) => item.id}
                renderItem={renderActivity}
                ItemSeparatorComponent={() => <View style={styles.logDivider} />}
              />
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#050915'
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 48
  },
  connectionPill: {
    alignSelf: 'center',
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.45)'
  },
  connectionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8
  },
  connected: {
    backgroundColor: '#4ade80'
  },
  disconnected: {
    backgroundColor: '#f97316'
  },
  connectionLabel: {
    color: '#E5E7FF',
    fontSize: 12,
    fontWeight: '600'
  },
  header: {
    marginTop: 36,
    alignItems: 'center'
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#F8FAFF',
    textAlign: 'center'
  },
  subtitle: {
    fontSize: 16,
    color: '#A5B4FF',
    marginTop: 6
  },
  card: {
    marginTop: 28,
    backgroundColor: '#101a33',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)',
    shadowColor: '#02040a',
    shadowOpacity: 0.45,
    shadowOffset: { width: 0, height: 16 },
    shadowRadius: 24,
    elevation: 10
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    marginBottom: 24,
    borderWidth: 1.1
  },
  statusNormal: {
    backgroundColor: 'rgba(34, 197, 94, 0.18)',
    borderColor: 'rgba(34, 197, 94, 0.45)'
  },
  statusLocked: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.45)'
  },
  statusRemedial: {
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
    borderColor: 'rgba(250, 204, 21, 0.45)'
  },
  statusText: {
    color: '#F9FBFF',
    fontWeight: '700'
  },
  section: {
    marginBottom: 28
  },
  sectionCentered: {
    alignItems: 'center',
    paddingVertical: 32
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#E4E9FF',
    marginBottom: 14
  },
  sectionHint: {
    fontSize: 14,
    color: '#9EA7FF'
  },
  sectionHintCentered: {
    fontSize: 15,
    color: '#C0C8FF',
    textAlign: 'center',
    marginHorizontal: 18,
    marginTop: 10,
    lineHeight: 22
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(79, 85, 210, 0.25)',
    marginVertical: 24
  },
  timerDisplay: {
    backgroundColor: 'rgba(54, 64, 128, 0.22)',
    borderRadius: 18,
    paddingVertical: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.45)',
    marginBottom: 18
  },
  timerWarning: {
    borderColor: 'rgba(255, 159, 67, 0.7)',
    backgroundColor: 'rgba(255, 159, 67, 0.16)'
  },
  timerValue: {
    fontSize: 38,
    fontWeight: '800',
    color: '#F4F6FF',
    letterSpacing: 2
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  button: {
    flex: 1,
    marginHorizontal: 5,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.2)'
  },
  buttonLabel: {
    fontWeight: '700',
    color: '#f9fbff',
    fontSize: 15
  },
  buttonLabelSecondary: {
    color: '#e2e8f0'
  },
  buttonLabelDisabled: {
    color: 'rgba(249, 251, 255, 0.55)'
  },
  fullWidthButton: {
    marginTop: 18,
    marginHorizontal: 0
  },
  buttonDisabled: {
    opacity: 0.55
  },
  primary: {
    backgroundColor: '#6366f1'
  },
  danger: {
    backgroundColor: '#f87171'
  },
  secondary: {
    backgroundColor: '#1f2937'
  },
  success: {
    backgroundColor: '#22c55e'
  },
  input: {
    backgroundColor: 'rgba(18, 24, 46, 0.9)',
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 18,
    color: '#F5F7FF',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.45)',
    marginTop: 10
  },
  warningBox: {
    backgroundColor: 'rgba(255, 159, 67, 0.16)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 171, 89, 0.45)'
  },
  warningTitle: {
    fontWeight: '700',
    color: '#FDBA74',
    marginBottom: 6
  },
  warningBody: {
    color: '#FFEAD1',
    lineHeight: 21
  },
  lockedEmoji: {
    fontSize: 52,
    marginBottom: 14
  },
  spinner: {
    marginVertical: 18
  },
  taskBox: {
    backgroundColor: 'rgba(64, 73, 140, 0.35)',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.4)',
    marginBottom: 18
  },
  taskLabel: {
    color: '#C7D2FF',
    fontWeight: '700',
    marginBottom: 6
  },
  taskBody: {
    color: '#E8ECFF',
    fontSize: 16,
    lineHeight: 23
  },
  logSection: {
    marginTop: 14
  },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7
  },
  logTimestamp: {
    color: '#9CA8FF',
    fontWeight: '600',
    fontSize: 12,
    width: 86
  },
  logMessage: {
    color: '#EEF2FF',
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    lineHeight: 19
  },
  logDivider: {
    height: 1,
    backgroundColor: 'rgba(79, 85, 210, 0.2)'
  }
});

export default App;
