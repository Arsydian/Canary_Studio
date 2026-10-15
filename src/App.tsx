import { useState, useEffect, type ReactNode } from 'react'
import {
  Shield,
  FileCode,
  FileText,
  MessageSquare,
  Type,
  Copy,
  Check,
  Download,
  AlertTriangle,
  ChevronDown,
  Eye,
  EyeOff,
} from 'lucide-react'

import {
  DEFAULT_PEER_INSTRUCTIONS,
  DEFAULT_PHRASE,
  DEFAULT_REFERENCE,
  buildCitationDirective,
  buildPhraseDirective,
  embedUnicodeToken,
  generateCanvasHtml,
  generateDiscussionBoardHtml,
  generatePdfCanaryBlob,
} from './canaryEngine'

// Close to typical clinical-ethics course material without touching the benchmark citation's
// topic (NICU care for opioid-exposed infants), so the citation stays irrelevant to the task.
const EXAMPLE_PROMPT =
  "Select one clinical case from Module 4. In a 3–4 page paper, explain how systemic pressure " +
  "affects provider decision-making.\n\n" +
  "Propose two practical strategies your care team could use to uphold ethical standards, " +
  "and support each with peer-reviewed evidence."

type Trap = "essay" | "post" | "custom"
type TrapKind = "citation" | "phrase"

const TRAPS: Array<{ id: Trap; label: string }> = [
  { id: "essay", label: "Essay / Paper: cite a planted source" },
  { id: "post", label: "Post: use an uncommon phrase" },
  { id: "custom", label: "Customize: choose your own citation or phrase" },
]

/** Words to search for when grading: the first author's last name and the end of the DOI. */
function citationSearchTerms(reference: string): string[] {
  const lastName = /^\s*([A-Z][A-Za-z'’-]+),/.exec(reference)?.[1]
  const doiTail = /\b10\.\d{4,9}\/(\S+)/.exec(reference)?.[1].replace(/[.,;)]+$/, "").split("/").pop()
  return [lastName, doiTail].filter((t): t is string => Boolean(t))
}

/** The longest word of a phrase, as a fallback search in case an AI tool rewords it slightly. */
function phraseKeyword(phrase: string): string | null {
  const words = phrase.split(/\s+/).filter(Boolean)
  return words.length > 1 ? words.reduce((a, b) => (b.length > a.length ? b : a)) : null
}

type Destination = "assignment" | "discussion" | "pdf" | "text"

const DESTINATIONS: Array<{ id: Destination; title: string; description: string; icon: typeof FileCode }> = [
  {
    id: "assignment",
    title: "Canvas Assignment or Page",
    description: "Recommended. You paste into the Canvas editor's code view.",
    icon: FileCode,
  },
  {
    id: "discussion",
    title: "Canvas Discussion",
    description: "Discussion topics. You paste into the Canvas editor's code view.",
    icon: MessageSquare,
  },
  {
    id: "pdf",
    title: "PDF handout",
    description: "Download a PDF and attach it in Canvas.",
    icon: FileText,
  },
  {
    id: "text",
    title: "Quiz, Announcement, or other text box",
    description: "Paste normally. Less reliable: ChatGPT strips the hidden text.",
    icon: Type,
  },
]

// Settings persist in this browser only; private windows may block storage, which is fine.
function loadSetting(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Settings just won't be remembered.
  }
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Step({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 sm:p-6">
      <h2 className="flex items-center gap-3 text-base sm:text-lg font-bold text-slate-900">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
          {number}
        </span>
        {title}
      </h2>
      <div className="mt-4 space-y-4 text-sm text-slate-700 leading-relaxed">{children}</div>
    </section>
  )
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-800">
      {children}
    </kbd>
  )
}

function Shortcut({ letter }: { letter: string }) {
  return (
    <>
      <Key>Ctrl</Key>+<Key>{letter}</Key> (<Key>Cmd</Key>+<Key>{letter}</Key> on a Mac)
    </>
  )
}

const CODE_VIEW_BUTTON = <Key>&lt;/&gt;</Key>

function Instructions({ steps }: { steps: ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((step, idx) => (
        <li key={idx} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
            {idx + 1}
          </span>
          <span>{step}</span>
        </li>
      ))}
    </ol>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-700 mb-1">{label}</span>
      {children}
    </label>
  )
}

function Callout({ tone, children }: { tone: "warning" | "info"; children: ReactNode }) {
  const styles =
    tone === "warning"
      ? "bg-amber-50 border-amber-200 text-amber-900"
      : "bg-blue-50 border-blue-200 text-blue-900"
  return (
    <div className={`flex gap-2.5 rounded-lg border p-3 text-sm ${styles}`}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

const inputClass =
  "w-full text-sm bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [prompt, setPrompt] = useState<string>(() => loadSetting("canary_saved_prompt") ?? "")
  const [destination, setDestination] = useState<Destination>(() => {
    const stored = loadSetting("canary_destination")
    return DESTINATIONS.find((d) => d.id === stored)?.id ?? "assignment"
  })
  const [trap, setTrap] = useState<Trap>(() => {
    const stored = loadSetting("canary_trap")
    return TRAPS.find((t) => t.id === stored)?.id ?? "essay"
  })
  const [customKind, setCustomKind] = useState<TrapKind>(() =>
    loadSetting("canary_custom_kind") === "phrase" ? "phrase" : "citation"
  )
  const [customCitation, setCustomCitation] = useState<string>(() => loadSetting("canary_custom_citation") ?? "")
  const [customPhrase, setCustomPhrase] = useState<string>(() => loadSetting("canary_custom_phrase") ?? "")

  const [peerReqs, setPeerReqs] = useState(DEFAULT_PEER_INSTRUCTIONS)

  const [pdfCourse, setPdfCourse] = useState("NURS / SOWK 4820: Clinical Practice & Research Ethics")
  const [pdfTitle, setPdfTitle] = useState("Module 4 Case Study & Literature Synthesis")
  const [pdfDue, setPdfDue] = useState("Sunday by 11:59 PM")
  const [pdfPoints, setPdfPoints] = useState("100 Points")
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)

  const [copied, setCopied] = useState(false)
  const [showCode, setShowCode] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => saveSetting("canary_saved_prompt", prompt), [prompt])
  useEffect(() => saveSetting("canary_destination", destination), [destination])
  useEffect(() => saveSetting("canary_trap", trap), [trap])
  useEffect(() => saveSetting("canary_custom_kind", customKind), [customKind])
  useEffect(() => saveSetting("canary_custom_citation", customCitation), [customCitation])
  useEffect(() => saveSetting("canary_custom_phrase", customPhrase), [customPhrase])

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3500)
  }

  // -------------------------------------------------------------------------
  // Derived output
  // -------------------------------------------------------------------------

  const hasPrompt = prompt.trim().length > 0
  const trapKind: TrapKind = trap === "essay" ? "citation" : trap === "post" ? "phrase" : customKind
  const reference = trap === "custom" ? customCitation.trim() : DEFAULT_REFERENCE
  const phrase = trap === "custom" ? customPhrase.trim() : DEFAULT_PHRASE
  const trapReady = trapKind === "citation" ? reference.length > 0 : phrase.length > 0
  const hiddenLine = trapKind === "citation" ? buildCitationDirective(reference) : buildPhraseDirective(phrase)
  const hiddenLineStart = hiddenLine.split(" ").slice(0, 2).join(" ")
  const searchTerms = trapKind === "citation" ? citationSearchTerms(reference) : [phrase]
  const searchFallback = trapKind === "phrase" ? phraseKeyword(phrase) : null
  const usesCodeView = destination === "assignment" || destination === "discussion"

  const copyText =
    destination === "assignment"
      ? generateCanvasHtml(prompt, hiddenLine)
      : destination === "discussion"
        ? generateDiscussionBoardHtml(prompt, hiddenLine, peerReqs)
        : destination === "text"
          ? embedUnicodeToken(prompt, hiddenLine)
          : ""

  const chooseDestination = (id: Destination) => {
    setDestination(id)
    // Match the trap to the format; a customized trap is left alone.
    if (trap !== "custom") setTrap(id === "discussion" ? "post" : "essay")
  }

  const copyLabel = usesCodeView ? "Copy code for Canvas" : "Copy text"

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(copyText)
      setCopied(true)
      showToast("Copied! Now paste it into Canvas.")
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setShowCode(true)
      showToast("Couldn't copy automatically. Select the text in the box below and copy it.")
    }
  }

  const handleDownloadPdf = async () => {
    try {
      setIsPdfGenerating(true)
      const blob = await generatePdfCanaryBlob({
        visiblePrompt: prompt,
        directive: hiddenLine,
        courseName: pdfCourse,
        assignmentTitle: pdfTitle,
        dueDate: pdfDue,
        points: pdfPoints,
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${pdfTitle.toLowerCase().replace(/\s+/g, "_")}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      showToast("PDF downloaded. Now attach it in Canvas.")
    } catch (err) {
      console.error(err)
      showToast("Couldn't create the PDF. Remove unusual symbols from your text and try again.")
    } finally {
      setIsPdfGenerating(false)
    }
  }

  // -------------------------------------------------------------------------
  // Step 3 instructions per destination
  // -------------------------------------------------------------------------

  const pasteIntoCodeView: ReactNode[] = [
    <>
      Click the {CODE_VIEW_BUTTON} button at the <strong>bottom-right corner</strong> of the text editor. The box
      switches to show code.
    </>,
    <>
      Click inside the code box, select everything with <Shortcut letter="A" />, then paste with <Shortcut letter="V" />.
      This replaces what was there.
    </>,
    <>Click {CODE_VIEW_BUTTON} again. You should see only your normal instructions.</>,
  ]

  const copySteps: Record<Destination, ReactNode[]> = {
    assignment: [
      <>
        Click <strong>{copyLabel}</strong> above.
      </>,
      <>
        In Canvas, open the assignment (or page) and click <strong>Edit</strong>.
      </>,
      ...pasteIntoCodeView,
      <>
        Click <strong>Save</strong>.
      </>,
    ],
    discussion: [
      <>
        Click <strong>{copyLabel}</strong> above.
      </>,
      <>
        In Canvas, go to <strong>Discussions</strong> and click <strong>+ Discussion</strong> (or open an existing one
        and click <strong>Edit</strong>).
      </>,
      ...pasteIntoCodeView,
      <>
        Optional: turn on <strong>Users must post before seeing replies</strong>, then click <strong>Save</strong>.
      </>,
    ],
    pdf: [
      <>
        Check the details above and click <strong>Download PDF</strong>.
      </>,
      <>
        In Canvas, open the assignment and click <strong>Edit</strong>.
      </>,
      <>
        In the editor toolbar, click the <strong>Document</strong> button (a page with a folded corner) and choose{" "}
        <strong>Upload Document</strong>.
      </>,
      <>
        Choose the PDF you downloaded and click <strong>Submit</strong>. Canvas adds a link to it.
      </>,
      <>
        Click <strong>Save</strong>.
      </>,
    ],
    text: [
      <>
        Click <strong>{copyLabel}</strong> above.
      </>,
      <>
        In Canvas, open the quiz, announcement, or other item and click <strong>Edit</strong>.
      </>,
      <>
        Click in the normal text box, select the old text, and paste with <Shortcut letter="V" />. You don't need the{" "}
        {CODE_VIEW_BUTTON} button for this one.
      </>,
      <>
        Click <strong>Save</strong>.
      </>,
    ],
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {toastMessage && (
        <div
          role="status"
          className="fixed top-5 right-5 z-50 max-w-sm bg-slate-900 text-white px-5 py-3 rounded-lg shadow-xl flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0 text-emerald-400" />
          <span className="text-sm font-medium">{toastMessage}</span>
        </div>
      )}

      <header className="bg-slate-900 text-white">
        <div className="max-w-3xl mx-auto px-4 py-6 flex items-start gap-3">
          <div className="p-2 bg-blue-600 rounded-lg shrink-0">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl">Canvas AI Canary Studio</h1>
            <p className="text-sm text-slate-300 mt-1">
              Adds a hidden line to your assignment. Students don't see it, but if someone pastes your instructions
              into an AI tool, the AI usually follows it and leaves a mark you can search for.
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* Step 1 */}
        <Step number={1} title="Paste your assignment instructions">
          <p>Type or paste exactly what students should read. It's saved in this browser automatically.</p>
          <textarea
            aria-label="Assignment instructions"
            className={`${inputClass} h-44`}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Paste your assignment instructions here..."
          />
          <div className="flex items-center gap-4 text-xs">
            <button onClick={() => setPrompt(EXAMPLE_PROMPT)} className="font-semibold text-blue-700 hover:underline">
              Fill in an example
            </button>
            {hasPrompt && (
              <button onClick={() => setPrompt("")} className="font-semibold text-slate-500 hover:underline">
                Clear
              </button>
            )}
          </div>
        </Step>

        {/* Step 2 */}
        <Step number={2} title="Where will students see it?">
          <div role="radiogroup" aria-label="Where students will see it" className="grid gap-3 sm:grid-cols-2">
            {DESTINATIONS.map((d) => {
              const Icon = d.icon
              const selected = d.id === destination
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => chooseDestination(d.id)}
                  className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition ${
                    selected ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? "text-blue-600" : "text-slate-500"}`} />
                  <span>
                    <span className="block font-semibold text-slate-900">{d.title}</span>
                    <span className="block text-xs text-slate-600 mt-0.5">{d.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Step>

        {/* Step 3 */}
        <Step number={3} title="Set the canary trap">
          <p>Choose what the hidden line asks AI tools to do. Students never see it.</p>
          <Field label="Trap type">
            <select className={inputClass} value={trap} onChange={(e) => setTrap(e.target.value as Trap)}>
              {TRAPS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>

          {trap === "essay" && (
            <p>
              AI tools are asked to cite <strong>Cain &amp; Held (2026)</strong>, a real study picked to sound like
              course material without being relevant to the assignment. Best for essays and papers.
            </p>
          )}
          {trap === "post" && (
            <p>
              AI tools are asked to use the phrase <strong>"{DEFAULT_PHRASE}"</strong> in a sentence. Best for
              discussion posts, where a formal citation would look out of place.
            </p>
          )}
          {trap === "custom" && (
            <div className="space-y-4 rounded-lg bg-slate-50 border border-slate-200 p-4">
              <fieldset>
                <legend className="text-xs font-semibold text-slate-700 mb-2">What should AI tools add?</legend>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="customKind"
                      checked={customKind === "citation"}
                      onChange={() => setCustomKind("citation")}
                    />
                    A citation
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="customKind"
                      checked={customKind === "phrase"}
                      onChange={() => setCustomKind("phrase")}
                    />
                    A phrase
                  </label>
                </div>
              </fieldset>
              {customKind === "citation" ? (
                <>
                  <Field label="Paste the full reference">
                    <textarea
                      className={`${inputClass} h-28`}
                      value={customCitation}
                      onChange={(e) => setCustomCitation(e.target.value)}
                      placeholder="Author, A. A., & Author, B. B. (Year). Title of the article. Journal Name, 12(3), 45-67. https://doi.org/..."
                    />
                  </Field>
                  <p className="text-xs text-slate-600">
                    Choose a real source that sounds close to your course material but isn't relevant to this
                    assignment, so students working on their own have no reason to cite it. Include the DOI if it has
                    one: it gives you a unique word to search for when grading.
                  </p>
                </>
              ) : (
                <>
                  <Field label="Phrase">
                    <input
                      className={inputClass}
                      value={customPhrase}
                      onChange={(e) => setCustomPhrase(e.target.value)}
                      placeholder={`For example: ${DEFAULT_PHRASE}`}
                    />
                  </Field>
                  <p className="text-xs text-slate-600">
                    Pick two or three words students in your course would almost never write. Avoid common sayings,
                    such as "canary in a coal mine".
                  </p>
                </>
              )}
            </div>
          )}

          {trapReady && (
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                <EyeOff className="w-4 h-4" /> Hidden line (copied along with your instructions, never shown)
              </p>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{hiddenLine}</div>
            </div>
          )}
        </Step>

        {/* Step 4 */}
        <Step number={4} title={destination === "pdf" ? "Download the PDF and attach it in Canvas" : "Copy it into Canvas"}>
          {!hasPrompt || !trapReady ? (
            <p className="rounded-lg bg-slate-50 border border-dashed border-slate-300 p-4 text-slate-500">
              {!hasPrompt
                ? "Paste your instructions in step 1 first."
                : `Enter your ${customKind} in step 3 first.`}
            </p>
          ) : (
            <>
              {destination === "discussion" && (
                <Field label="Peer reply instructions (students see these)">
                  <textarea className={`${inputClass} h-20`} value={peerReqs} onChange={(e) => setPeerReqs(e.target.value)} />
                </Field>
              )}

              {destination === "pdf" && (
                <div className="grid gap-4 sm:grid-cols-2 rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <Field label="Course">
                    <input className={inputClass} value={pdfCourse} onChange={(e) => setPdfCourse(e.target.value)} />
                  </Field>
                  <Field label="Assignment title">
                    <input className={inputClass} value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} />
                  </Field>
                  <Field label="Due date">
                    <input className={inputClass} value={pdfDue} onChange={(e) => setPdfDue(e.target.value)} />
                  </Field>
                  <Field label="Points">
                    <input className={inputClass} value={pdfPoints} onChange={(e) => setPdfPoints(e.target.value)} />
                  </Field>
                </div>
              )}

              {destination === "pdf" ? (
                <button
                  onClick={handleDownloadPdf}
                  disabled={isPdfGenerating}
                  className="w-full sm:w-auto py-3 px-6 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-base font-bold flex items-center justify-center gap-2 transition shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  {isPdfGenerating ? "Creating PDF..." : "Download PDF"}
                </button>
              ) : (
                <button
                  onClick={handleCopy}
                  className="w-full sm:w-auto py-3 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-bold flex items-center justify-center gap-2 transition shadow-sm"
                >
                  {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  {copied ? "Copied!" : copyLabel}
                </button>
              )}

              <Instructions steps={copySteps[destination]} />

              {usesCodeView && (
                <Callout tone="warning">
                  Paste only after clicking {CODE_VIEW_BUTTON}. If you paste into the normal editor, students will see
                  the code as text.
                </Callout>
              )}
              {destination === "text" && (
                <Callout tone="warning">
                  ChatGPT removes this kind of hidden text, so this option only catches some AI tools. Use{" "}
                  <strong>Canvas Assignment or Page</strong> when you can.
                </Callout>
              )}
              {destination === "pdf" && (
                <Callout tone="info">
                  This catches AI tools that read the PDF's text. Tools that read the page as a picture won't see the
                  hidden line, so also put the instructions in the assignment itself (Canvas Assignment or Page) when
                  you can.
                </Callout>
              )}

              {destination !== "pdf" && (
                <div className="pt-2">
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                    <Eye className="w-4 h-4" /> What students will see
                  </p>
                  {usesCodeView ? (
                    <div
                      className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4"
                      dangerouslySetInnerHTML={{ __html: copyText }}
                    />
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-white p-4 whitespace-pre-wrap">{prompt}</div>
                  )}
                </div>
              )}

              {destination !== "pdf" && (
                <div>
                  <button
                    onClick={() => setShowCode(!showCode)}
                    className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${showCode ? "rotate-180" : ""}`} />
                    {showCode ? "Hide" : "Show"} exactly what gets copied
                  </button>
                  {showCode && (
                    <textarea
                      readOnly
                      aria-label="Text that gets copied"
                      value={copyText}
                      onFocus={(e) => e.currentTarget.select()}
                      className="mt-2 w-full h-32 rounded-lg border border-slate-300 bg-slate-900 p-3 font-mono text-xs text-slate-200"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </Step>

        {/* Step 5 */}
        <Step number={5} title="Check that it worked (1 minute)">
          {destination === "text" ? (
            <p>
              This kind of hidden text stays invisible even when copied, so there's no simple check. If you want to
              be sure, use <strong>Canvas Assignment or Page</strong> instead.
            </p>
          ) : destination === "pdf" ? (
            <Instructions
              steps={[
                <>Open the PDF you downloaded.</>,
                <>
                  Select all the text with <Shortcut letter="A" /> and copy it with <Shortcut letter="C" />.
                </>,
                <>Paste it into Notepad (Windows), TextEdit (Mac), or a blank email.</>,
                <>
                  You should see a line starting with <strong>"{hiddenLineStart}"</strong>. It isn't visible on the
                  page itself.
                </>,
              ]}
            />
          ) : (
            <>
              <Instructions
                steps={[
                  <>
                    In your Canvas course, click <strong>Student View</strong> (top-right of the course home page),
                    then open the {destination === "discussion" ? "discussion" : "assignment"}.
                  </>,
                  <>Check that the instructions look normal, with no extra text.</>,
                  <>
                    Highlight the instructions, copy them with <Shortcut letter="C" />, and paste into Notepad (Windows),
                    TextEdit (Mac), or a blank email.
                  </>,
                  <>
                    You should see a line starting with <strong>"{hiddenLineStart}"</strong>. If you do, it's working.
                  </>,
                  <>
                    Click <strong>Leave Student View</strong> (bottom-right of the screen).
                  </>,
                ]}
              />
              <p className="text-slate-500">
                Don't see the line? You probably pasted into the normal editor. Repeat step 4 and paste after clicking{" "}
                {CODE_VIEW_BUTTON}.
              </p>
            </>
          )}
        </Step>

        {/* Step 6 */}
        <Step number={6} title="When grading">
          {!trapReady ? (
            <p className="text-slate-500">Finish step 3 to see what to search for.</p>
          ) : searchTerms.length > 0 ? (
            <p>
              {destination === "discussion" ? "In each post (or in SpeedGrader)" : "In SpeedGrader"}, press{" "}
              <Shortcut letter="F" /> and search for{" "}
              {searchTerms.map((term, idx) => (
                <span key={term}>
                  {idx > 0 && " or "}
                  <Key>{term}</Key>
                </span>
              ))}
              {trapKind === "citation" && searchTerms.length > 1 && (
                <span className="text-slate-500"> (the first author's last name, and the end of the DOI)</span>
              )}
              .
              {searchFallback && (
                <>
                  {" "}
                  If nothing turns up, also try <Key>{searchFallback}</Key> on its own, in case the wording was changed
                  slightly.
                </>
              )}
            </p>
          ) : (
            <p>
              In SpeedGrader, press <Shortcut letter="F" /> and search for the first author's last name from your
              citation.
            </p>
          )}
          <p className="text-slate-500">
            If you find a match, ask the student to walk you through how they found that{" "}
            {trapKind === "citation" ? "source" : "wording"}.
          </p>
        </Step>
      </main>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        Runs entirely in your browser. Nothing you type is uploaded.
      </footer>
    </div>
  )
}
