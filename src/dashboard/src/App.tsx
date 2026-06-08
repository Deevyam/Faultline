import { useEffect, useRef } from 'react';
import { DashboardCanvas } from './components/DashboardCanvas';
import { GlassPanel } from './components/GlassPanel';
import { useDashboardStore } from './store/useDashboardStore';

export default function App() {
  const {
    files,
    resetSimulation,
    setRunning,
    setStartTime,
    setElapsedTime,
    updateFile,
    addGuardrailEvent,
    incrementLlamaCalls,
    incrementClaudeCalls,
    setMode,
    setActiveNodeId,
  } = useDashboardStore();

  const timerRef = useRef<number | null>(null);
  const simulationRef = useRef<boolean>(false);
  const timeoutIds = useRef<number[]>([]);

  // Cleanup helper
  const clearAllScheduledTasks = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    timeoutIds.current.forEach((id) => clearTimeout(id));
    timeoutIds.current = [];
    simulationRef.current = false;
  };

  useEffect(() => {
    return () => clearAllScheduledTasks();
  }, []);

  // Timer runner
  const startTimer = (start: number) => {
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const totalSec = Math.floor(elapsed / 1000);
      const min = Math.floor(totalSec / 60);
      const sec = totalSec % 60;
      setElapsedTime(
        `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
      );
    }, 200);
  };

  // Helper sleep function
  const sleep = (ms: number) => {
    return new Promise((resolve) => {
      if (!simulationRef.current) {
        resolve(null);
        return;
      }
      const timeoutId = setTimeout(resolve, ms);
      timeoutIds.current.push(timeoutId);
    });
  };

  // Animate processing of a single file
  const animateFile = async (index: number) => {
    const file = files[index];
    if (!file || !simulationRef.current) return;

    // Focus camera on the node being scanned
    setActiveNodeId(index);

    // Scroll the right panel feed item into view
    const cardEl = document.getElementById(`file-card-${index}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // 1. Phase 1 - Fast Scan with Llama 8B
    updateFile(index, {
      status: 'scanning',
      phase: `Phase 1 — Fast scanning with ${file.model}...`,
      progress: 0,
    });
    incrementLlamaCalls();

    // Increment progress to 50% over Phase 1 duration
    const stepsP1 = 10;
    const intervalP1 = file.phase1Time / stepsP1;
    for (let s = 1; s <= stepsP1; s++) {
      if (!simulationRef.current) return;
      updateFile(index, { progress: Math.round(s * (50 / stepsP1)) });
      await sleep(intervalP1);
    }

    // 2. Phase 2 - Deep Reasoning with Claude or Verification
    if (file.modelPhase2) {
      updateFile(index, {
        phase: `Phase 2 — Deep reasoning with ${file.modelPhase2}...`,
      });
      incrementClaudeCalls();
    } else {
      updateFile(index, {
        phase: 'Phase 2 — Validating code structures...',
      });
    }

    const stepsP2 = 10;
    const intervalP2 = file.phase2Time / stepsP2;
    for (let s = 1; s <= stepsP2; s++) {
      if (!simulationRef.current) return;
      updateFile(index, { progress: Math.round(50 + s * (50 / stepsP2)) });
      await sleep(intervalP2);
    }

    // 3. Mark complete & attach findings
    const hasFindings = file.findings.length > 0;
    const completionMessage = hasFindings
      ? `Complete — ${file.findings.length} issue${file.findings.length > 1 ? 's' : ''} detected`
      : 'Complete — No issues found';

    updateFile(index, {
      status: 'complete',
      phase: completionMessage,
      progress: 100,
    });
  };

  const handleStartDemo = async () => {
    // Stop any active simulations
    clearAllScheduledTasks();
    resetSimulation();
    setMode('demo');
    setRunning(true);
    simulationRef.current = true;

    const startVal = Date.now();
    setStartTime(startVal);
    startTimer(startVal);

    // Schedule guardrails ticker events
    const tickerEvents = [
      { icon: '🛡️', text: 'Secret redacted: AWS Access Key detected in payments/charge.py', delay: 3000 },
      { icon: '✅', text: 'Code fix validated: syntax check passed for charge.py suggestion', delay: 6000 },
      { icon: '🛡️', text: 'PII redacted: email address in handlers.ts error log', delay: 9000 },
      { icon: '✅', text: 'Fix validated: import statement resolved for retry decorator', delay: 12000 },
      { icon: '🔄', text: 'Model fallback: claude 4.5 → Llama 70B (rate limit hit)', delay: 15000 },
      { icon: '🛡️', text: 'Secret redacted: Stripe secret key in stripe.ts', delay: 17000 },
      { icon: '✅', text: 'Code fix validated: connection pool params type-checked', delay: 19000 },
      { icon: '🛡️', text: 'Injection blocked: potential prompt injection in PR description', delay: 21000 },
      { icon: '✅', text: 'Fix validated: DLQ handler exception hierarchy correct', delay: 23000 },
      { icon: '✅', text: 'Analysis complete: 8 findings across 7 files, 2 critical', delay: 25000 },
    ];

    tickerEvents.forEach((evt) => {
      const tid = setTimeout(() => {
        if (simulationRef.current) {
          addGuardrailEvent(evt.icon, evt.text);
        }
      }, evt.delay);
      timeoutIds.current.push(tid);
    });

    // Run files sequentially
    for (let i = 0; i < files.length; i++) {
      if (!simulationRef.current) break;
      await animateFile(i);
      await sleep(350); // breathing room between files
    }

    // Complete simulation
    if (simulationRef.current) {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunning(false);
      simulationRef.current = false;
      setActiveNodeId(null); // release cameras back to home
    }
  };

  const handleSwitchLive = () => {
    clearAllScheduledTasks();
    resetSimulation();
    setMode('live');
  };

  // SSE Event Stream Listener
  useEffect(() => {
    const sseUrl = window.location.port !== '3000'
      ? 'http://localhost:3000/api/events'
      : '/api/events';

    const eventSource = new EventSource(sseUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const store = useDashboardStore.getState();

        if (data.type === 'init') {
          if (data.state.running) {
            clearAllScheduledTasks();
            store.setMode('live');
            store.updateStateFromLive(data.state);
            if (data.state.startTime) {
              startTimer(data.state.startTime);
            } else {
              startTimer(Date.now());
            }
          }
        } else if (data.type === 'start') {
          clearAllScheduledTasks();
          store.startLiveRun(
            data.repo,
            data.prNumber,
            data.prTitle,
            data.files,
            data.phase1Model,
            data.phase2Model
          );
          startTimer(Date.now());
        } else if (data.type === 'file_start') {
          store.updateFile(data.fileIndex, {
            status: 'scanning',
            phase: data.phase || `Phase 1 - Fast scanning with ${store.phase1Model}...`,
            progress: 0,
            findings: []
          });
          store.incrementLlamaCalls();
        } else if (data.type === 'file_progress') {
          store.updateFile(data.fileIndex, {
            progress: data.progress,
            phase: data.phase || 'Scanning...'
          });
        } else if (data.type === 'file_complete') {
          const hasFindings = data.findings.length > 0;
          const completionMessage = hasFindings
            ? `Complete — ${data.findings.length} issue${data.findings.length > 1 ? 's' : ''} detected`
            : 'Complete — No issues found';

          store.updateFile(data.fileIndex, {
            status: data.status || 'complete',
            phase: completionMessage,
            progress: 100,
            findings: data.findings
          });

          if (hasFindings) {
            store.incrementClaudeCalls();
          }
        } else if (data.type === 'complete') {
          store.setRunning(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          store.addGuardrailEvent(
            '✅',
            `Analysis complete: ${data.summary.totalFindings} findings, ${data.summary.criticalFindings} critical`
          );
        }
      } catch (err) {
        console.error('Error parsing SSE event:', err);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
    };

    return () => {
      eventSource.close();
    };
  }, []);

  // Run demo on load
  useEffect(() => {
    const initTid = setTimeout(() => {
      handleStartDemo();
    }, 1500); // 1.5s delay to let stars and components render first
    return () => clearTimeout(initTid);
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#020205]">
      {/* Film grain noise overlay */}
      <div className="grain-overlay" />

      {/* 3D WebGL Canvas Layer */}
      <DashboardCanvas />

      {/* 2D Glassmorphic HUD HUD overlays */}
      <GlassPanel
        onStartDemo={handleStartDemo}
        onSwitchLive={handleSwitchLive}
      />
    </div>
  );
}
