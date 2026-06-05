import { motion, AnimatePresence } from 'framer-motion';
import { useDashboardStore } from '../store/useDashboardStore';

interface GlassPanelProps {
  onStartDemo: () => void;
  onSwitchLive: () => void;
}

export function GlassPanel({ onStartDemo, onSwitchLive }: GlassPanelProps) {
  const {
    mode,
    running,
    elapsedTime,
    filesAnalyzed,
    totalFiles,
    totalFindings,
    criticalCount,
    llamaCalls,
    claudeCalls,
    files,
    guardrailEvents,
    activeNodeId,
    setActiveNodeId,
  } = useDashboardStore();

  // Progress Calculations
  const progressPct = totalFiles > 0 ? Math.round((filesAnalyzed / totalFiles) * 100) : 0;
  const ringCircumference = 2 * Math.PI * 46;
  const ringOffset = ringCircumference - (progressPct / 100) * ringCircumference;

  // Model Donut Calculations
  const totalModelCalls = llamaCalls + claudeCalls;
  const donutCircumference = 2 * Math.PI * 24;
  const llamaPct = totalModelCalls > 0 ? llamaCalls / totalModelCalls : 0;
  const claudePct = totalModelCalls > 0 ? claudeCalls / totalModelCalls : 0;
  const llamaOffset = donutCircumference - (llamaPct * donutCircumference);
  const claudeOffset = donutCircumference - (claudePct * donutCircumference);

  const getLangIcon = (filename: string) => {
    const ext = filename.split('.').pop() || '';
    const icons: Record<string, string> = {
      py: '🐍',
      ts: '📜',
      js: '📜',
      java: '☕',
      rs: '🦀',
      go: '💎',
    };
    return icons[ext] || '📄';
  };

  return (
    <div className="absolute inset-0 flex flex-col pointer-events-none z-10 select-none">
      
      {/* ================= HEADER ================= */}
      <header className="h-[62px] w-full border-b border-white/[0.04] bg-[#020205]/65 backdrop-blur-xl flex items-center justify-between px-8 pointer-events-auto">
        <div className="flex items-center gap-3">
          <span className="text-xl animate-logo-pulse">⚡</span>
          <span className="font-extrabold text-sm tracking-[-0.03em] uppercase bg-gradient-to-r from-white via-slate-100 to-rose-400 bg-clip-text text-transparent">
            Faultline
          </span>
          <span className="h-[10px] w-px bg-white/10" />
          <span className="text-tracked-header text-[8px] mt-0.5">
            Engine v1.0.0
          </span>
        </div>

        <div className="flex items-center gap-8">
          {/* Status Badge */}
          <div className="flex items-center gap-2.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                running
                  ? 'bg-rose-500 glow-dot-red animate-status-pulse-red'
                  : filesAnalyzed === totalFiles && totalFiles > 0
                  ? 'bg-[#10b981] glow-dot-green'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-tracked-header text-[8px]">
              {running
                ? 'Processing PR'
                : filesAnalyzed === totalFiles && totalFiles > 0
                ? 'Analysis Complete'
                : 'Standby Mode'}
            </span>
          </div>

          {/* Timer */}
          <div className="flex items-center gap-2">
            <span className="text-tracked-header text-[8px]">Duration</span>
            <span className="font-mono text-xs font-semibold text-slate-100 tabular-nums">
              {elapsedTime}
            </span>
          </div>

          {/* Model Status */}
          <div className="flex items-center gap-2">
            <span className="text-tracked-header text-[8px]">Processor</span>
            <span className="font-mono text-[10px] font-semibold text-rose-300">
              {running
                ? claudeCalls > 0
                  ? 'Claude 3.7 (Deep)'
                  : 'Llama 8B (Fast)'
                : 'Idle'}
            </span>
          </div>
        </div>

        {/* Demo/Live Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onStartDemo}
            className={`px-3 py-1 rounded border text-[9px] font-bold uppercase tracking-[0.12em] transition-all duration-300 cursor-pointer ${
              mode === 'demo'
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                : 'bg-transparent border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
            }`}
          >
            Run Demo
          </button>
          <button
            onClick={onSwitchLive}
            className={`px-3 py-1 rounded border text-[9px] font-bold uppercase tracking-[0.12em] transition-all duration-300 cursor-pointer ${
              mode === 'live'
                ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                : 'bg-transparent border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10'
            }`}
          >
            Live Feed
          </button>
        </div>
      </header>

      {/* ================= MAIN LAYOUT ================= */}
      <div className="flex-1 flex justify-between overflow-hidden">
        
        {/* ================= LEFT SIDEBAR (MONOLITHIC PANE) ================= */}
        <aside className="w-[340px] border-r border-white/[0.04] bg-[#020205]/45 backdrop-blur-xl flex flex-col p-7 pointer-events-auto h-full overflow-y-auto">
          
          {/* PR Header */}
          <div className="flex flex-col">
            <span className="text-tracked-header">Target Repository</span>
            <span className="font-mono text-[10px] text-slate-400 mt-1">acme-corp/payments-service</span>
            <h2 className="text-lg font-extrabold tracking-[-0.02em] leading-snug text-slate-100 mt-2">
              feat: add Stripe retry logic & connection pooling
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-3">
              <span className="text-rose-500 font-bold">#847</span>
              <span>•</span>
              <span className="text-cyan-400">@sarah-chen</span>
              <span>•</span>
              <span>8 files changed</span>
            </div>
          </div>

          <div className="h-px bg-white/[0.04] my-6" />

          {/* Minimalist Progress Meter */}
          <div className="flex flex-col items-center">
            <span className="text-tracked-header self-start">Engine Progress</span>
            <div className="relative w-[110px] h-[110px] my-5">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 110 110">
                <circle
                  className="fill-none stroke-white/[0.03] stroke-[6]"
                  cx="55"
                  cy="55"
                  r="46"
                />
                <motion.circle
                  className="fill-none stroke-[6] stroke-rose-500"
                  cx="55"
                  cy="55"
                  r="46"
                  strokeDasharray={ringCircumference}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                  strokeLinecap="round"
                  style={{
                    filter: 'drop-shadow(0 0 5px rgba(225, 29, 72, 0.4))',
                  }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-xl font-black tracking-tight text-white leading-none">
                  {progressPct}%
                </div>
                <div className="text-[7px] text-slate-500 font-semibold uppercase tracking-widest mt-1">
                  {filesAnalyzed} / {totalFiles}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-white/[0.04] my-6" />

          {/* Stats List (Minimalist - no boxes) */}
          <div className="flex flex-col gap-3">
            <span className="text-tracked-header mb-1">Detections Metrics</span>
            
            <div className="flex justify-between items-center py-2 border-b border-white/[0.02]">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Scanned Files</span>
              <span className="font-mono text-xs font-semibold text-slate-200">{filesAnalyzed}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-white/[0.02]">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Findings</span>
              <span className="font-mono text-xs font-semibold text-slate-200">{totalFindings}</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Critical Failures</span>
              <span className="font-mono text-xs font-semibold text-rose-500 glow-text-rose">{criticalCount}</span>
            </div>
          </div>

          <div className="h-px bg-white/[0.04] my-6" />

          {/* Model distribution chart */}
          <div className="flex flex-col gap-4">
            <span className="text-tracked-header">LLM Co-Processors</span>
            <div className="flex items-center gap-5">
              <div className="relative w-[70px] h-[70px] flex-shrink-0">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 70 70">
                  <circle
                    className="fill-none stroke-white/[0.03] stroke-[8]"
                    cx="35"
                    cy="35"
                    r="24"
                  />
                  {totalModelCalls > 0 && (
                    <>
                      <circle
                        className="fill-none stroke-orange-500 stroke-[8]"
                        cx="35"
                        cy="35"
                        r="24"
                        strokeDasharray={donutCircumference}
                        strokeDashoffset={llamaOffset}
                        strokeLinecap="round"
                      />
                      <circle
                        className="fill-none stroke-purple-500 stroke-[8]"
                        cx="35"
                        cy="35"
                        r="24"
                        strokeDasharray={donutCircumference}
                        strokeDashoffset={claudeOffset}
                        strokeLinecap="round"
                        transform={`rotate(${llamaPct * 360} 35 35)`}
                      />
                    </>
                  )}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-semibold text-slate-400">
                  {totalModelCalls}
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1 text-[9px] text-slate-400 font-mono">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                    <span>Llama 8B</span>
                  </div>
                  <span className="font-bold text-slate-200">{llamaCalls}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span>Claude 3.7</span>
                  </div>
                  <span className="font-bold text-slate-200">{claudeCalls}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ================= CENTER VIEWPORT (CANVAS AREA) ================= */}
        <div className="flex-1" />

        {/* ================= RIGHT SIDEBAR (FILE REVIEW FEED) ================= */}
        <aside className="w-[460px] border-l border-white/[0.04] bg-[#020205]/45 backdrop-blur-xl flex flex-col p-7 pointer-events-auto h-full overflow-hidden">
          <div className="flex justify-between items-center mb-6">
            <span className="text-tracked-header">File Analysis Feed</span>
            <span className="font-mono text-[10px] text-slate-500 tabular-nums">
              {filesAnalyzed} / {totalFiles} Completed
            </span>
          </div>

          {/* Accordion File Feed List */}
          <div className="flex-1 overflow-y-auto flex flex-col pr-1 scroll-smooth">
            {mode === 'live' && filesAnalyzed === 0 && !running ? (
              <div className="flex flex-col items-center justify-center h-[350px] text-center p-6 border border-dashed border-white/5 rounded-xl bg-black/10">
                <span className="text-2xl mb-2">📡</span>
                <span className="font-bold text-slate-300 text-xs mb-1">Waiting for Webhook</span>
                <p className="text-[10px] text-slate-500 max-w-[220px] leading-relaxed">
                  The analysis server is listening. Push a PR commit or trigger a run.
                </p>
                <div className="font-mono text-[9px] text-slate-600 bg-black/40 px-2 py-0.5 rounded mt-3">
                  POST /webhook
                </div>
              </div>
            ) : (
              files.map((file, idx) => {
                const isSelected = activeNodeId === idx;
                const isScanning = file.status === 'scanning';
                const isComplete = file.status === 'complete';
                const hasFindings = file.findings.length > 0;
                
                return (
                  <div
                    key={file.name}
                    id={`file-card-${idx}`}
                    className={`border-b border-white/[0.03] transition-all duration-300 ${
                      isSelected ? 'bg-white/[0.01]' : 'hover:bg-white/[0.005]'
                    }`}
                  >
                    {/* File row trigger */}
                    <div
                      onClick={() => setActiveNodeId(isSelected ? null : idx)}
                      className="py-4.5 px-3 flex items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <span className="text-sm flex-shrink-0">{getLangIcon(file.name)}</span>
                      
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs font-bold text-slate-100 truncate">
                          {file.name}
                        </div>
                        <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500 mt-1">
                          <span>{file.phase}</span>
                        </div>
                      </div>

                      {/* Small Status Indicator Dots */}
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {isScanning && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#06b6d4] glow-dot-blue animate-pulse" />
                            <span className="text-[9px] font-mono text-cyan-400 tracking-wider uppercase font-bold">Scan</span>
                          </div>
                        )}
                        {file.status === 'queued' && (
                          <span className="text-[9px] font-mono text-slate-600 uppercase font-bold">Queued</span>
                        )}
                        {isComplete && hasFindings && (
                          <div className="flex items-center gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${file.findings.some(f => f.severity === 'critical') ? 'bg-[#e11d48] glow-dot-red' : 'bg-orange-500 glow-dot-orange'}`} />
                            <span className={`text-[9px] font-mono tracking-wider uppercase font-bold ${file.findings.some(f => f.severity === 'critical') ? 'text-rose-400' : 'text-orange-400'}`}>
                              {file.findings.length} Issue{file.findings.length > 1 ? 's' : ''}
                            </span>
                          </div>
                        )}
                        {isComplete && !hasFindings && (
                          <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] glow-dot-green" />
                            <span className="text-[9px] font-mono text-emerald-400 tracking-wider uppercase font-bold">Clean</span>
                          </div>
                        )}
                        <span className={`text-[8px] text-slate-500 transition-transform duration-300 ml-1 ${isSelected ? 'rotate-180' : ''}`}>
                          ▼
                        </span>
                      </div>
                    </div>

                    {/* Progress strip */}
                    {isScanning && (
                      <div className="h-[1.5px] w-full bg-white/[0.02] overflow-hidden">
                        <motion.div
                          className="h-full bg-rose-500"
                          initial={{ width: '0%' }}
                          animate={{ width: `${file.progress}%` }}
                          transition={{ duration: 0.3 }}
                        />
                      </div>
                    )}

                    {/* Accordion content */}
                    <AnimatePresence initial={false}>
                      {isSelected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden bg-[#020205]/40"
                        >
                          <div className="pb-6 px-4 pt-1 flex flex-col gap-5">
                            {file.findings.length === 0 ? (
                              <div className="text-center py-5 text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
                                ✓ No vulnerability or resilience concerns.
                              </div>
                            ) : (
                              file.findings.map((finding, fIdx) => (
                                <div key={fIdx} className="flex flex-col gap-2">
                                  {/* Severity indicator */}
                                  <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-sm border uppercase font-mono ${
                                        finding.severity === 'critical'
                                          ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                                          : 'border-orange-500/20 bg-orange-500/10 text-orange-400'
                                      }`}>
                                        {finding.severity}
                                      </span>
                                      <span className="font-mono text-xs font-bold text-slate-200">
                                        {finding.pattern}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-slate-500">
                                      Line {finding.line}
                                    </span>
                                  </div>

                                  <p className="text-[11px] leading-relaxed text-slate-400 my-1">
                                    {finding.scenario}
                                  </p>

                                  {/* Mock IDE editor window for Suggested Fix */}
                                  <div className="editor-window rounded-lg overflow-hidden flex flex-col my-1">
                                    {/* Editor tab bar */}
                                    <div className="editor-header h-[28px] flex items-center justify-between px-3 text-[10px] text-slate-500 font-mono select-none">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-emerald-500 text-[8px]">●</span>
                                        <span className="font-bold text-slate-300">
                                          {file.name.split('/').pop()}
                                        </span>
                                        <span className="text-slate-600 text-[8px]">Suggested Fix</span>
                                      </div>
                                      <span>UTF-8</span>
                                    </div>

                                    {/* Editor layout */}
                                    <div className="flex text-[11px] font-mono leading-relaxed p-3 overflow-x-auto">
                                      {/* Editor line gutter */}
                                      <div className="editor-gutter flex flex-col pr-2.5 selection:bg-transparent">
                                        {finding.fix.split('\n').map((_, idx) => (
                                          <div key={idx}>{finding.line + idx}</div>
                                        ))}
                                      </div>
                                      
                                      {/* Code block */}
                                      <pre className="font-mono text-slate-300 text-[11px] pl-3 selection:bg-rose-500/20 w-full overflow-x-auto leading-relaxed">
                                        {finding.fix}
                                      </pre>
                                    </div>
                                  </div>
                                </div>
                              ))
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </aside>
      </div>

      {/* ================= FOOTER ================= */}
      <footer className="h-[52px] w-full border-t border-white/[0.04] bg-[#020205]/85 backdrop-blur-md flex items-center justify-between px-7 pointer-events-auto">
        <div className="flex items-center gap-4 w-full">
          <span className="text-tracked-header mt-0.5 flex-shrink-0">
            🛡️ Guardrail Status
          </span>
          
          {/* Scrolling Ticker using Framer Motion */}
          <div className="flex-1 overflow-hidden relative h-[24px]">
            <div className="absolute inset-0 flex items-center gap-6 overflow-hidden">
              <AnimatePresence mode="popLayout">
                {guardrailEvents.slice(0, 1).map((evt) => (
                  <motion.div
                    key={evt.id}
                    initial={{ y: 15, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -15, opacity: 0 }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="text-[10px] text-slate-400 font-mono truncate flex items-center gap-2"
                  >
                    <span>{evt.icon}</span>
                    <span>{evt.text}</span>
                    <span className="text-[8px] text-slate-600 bg-white/[0.03] px-1 py-0.5 rounded">
                      {evt.timestamp}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-1 rounded border border-white/[0.04] bg-white/[0.01] text-[10px] text-slate-400 font-mono flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 glow-dot-green" />
            <span>AI Gateway Connected</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
