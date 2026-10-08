# 🛡️ Canvas AI Canary Studio

[![Vite](https://img.shields.io/badge/Vite-6.0-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.0-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Cloudflare Pages](https://img.shields.io/badge/Cloudflare_Pages-Ready-F38020?logo=cloudflare&logoColor=white)](https://pages.cloudflare.com/)

A deterministic academic integrity verification suite designed for course instructors, faculty, and instructional designers using **Canvas LMS**.

Rather than relying on probabilistic, inaccurate AI detectors, **Canvas AI Canary Studio** embeds unobtrusive, deterministic verification directives directly into course assignments, PDFs, and discussion boards. When students submit raw prompts or assignment documents to unreviewed generative AI tools (such as ChatGPT, Claude, or Gemini), the AI follows the hidden directive and leaves undeniable forensic evidence—such as citing a specific benchmark research paper or weaving a designated canary token into its prose.

> 📖 **Looking for a non-technical instructor walkthrough?** See the [Educator's Guide to Canvas Canaries](file:///d:/Dev/Canary%20Studio/INSTRUCTOR_GUIDE.md) for step-by-step instructions.

---

## 🚀 The 5 Verification Vectors

1. **Option 1: Canvas LMS Native HTML Injection (Off-Screen CSS Token)**
   - Injects off-screen CSS (`position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; opacity: 0; font-size: 0pt;`) that bypasses Canvas Rich Content Editor (RCE) sanitization.
   - Invisible to student browsers, but automatically copied when students highlight or `Ctrl+A` copy the prompt into an LLM.
   - Features persistent prompt saving and live simulated Canvas previews.

2. **Option 2: Zero-Width Unicode Tag Steganography**
   - Encodes forensic audit directives into invisible Unicode Tag Space (`U+E0000` to `U+E007F`).
   - 100% invisible across standard text boxes, text editors, and announcements. Ingested and parsed by modern LLM tokenizers when pasted.

3. **Option 3: Academic PDF Brief Generator**
   - Renders professional academic assignment PDFs directly in browser memory using `pdf-lib` (zero server upload, 100% FERPA/student privacy compliant).
   - Injects a dual-layer canary: a transparent zero-opacity text stream and embedded document metadata (`/Subject`, `/Keywords`, `/Title`).

4. **Option 4: Canvas Discussion Board Prompt Trap**
   - Specifically engineered for informal discussion forums where formal academic citations look unnatural.
   - Instructs any AI responding to the prompt to naturally integrate the target word **`canary`** within a complete sentence.
   - Enables fast grading in Canvas SpeedGrader via `Ctrl+F "canary"`.

5. **Option 5: Submission Auditor & Scanner**
   - Automated grading inspector to audit student text submissions.
   - Scans for:
     - The benchmark citation: *Cain, S. M., & Held, M. L. (2026)* and DOI (`10.1093/swr/svag004`).
     - The Discussion Board canary token: the word *"canary"*.
     - Decodes hidden Unicode Tag steganography.
   - Generates confidence scores, highlighted excerpts, and evidence summaries.

---

## 🔒 Edge Password Protection (`functions/_middleware.ts`)

Access is secured at the Cloudflare edge using HTTP Basic Authentication implemented via Cloudflare Pages Functions:

- Every visitor must enter credentials before accessing the Studio.
- The password is authenticated against your Cloudflare Pages environment variable: **`APP_PASSWORD`**.
- **Fails Closed:** If `APP_PASSWORD` is not configured, the edge middleware displays a guided setup screen.
- **Unrestricted Mode:** If you wish to allow open access without basic auth, set `APP_PASSWORD` to `DISABLED` or `PUBLIC` in your Cloudflare dashboard.

---

## ⚙️ Cloudflare Pages Deployment

### Deploy via GitHub (Recommended)

1. Push this repository to your GitHub account (see [GitHub Setup](#-github-setup) below).
2. Log into the [Cloudflare Dashboard](https://dash.cloudflare.com/) and go to **Workers & Pages** &rarr; **Create application** &rarr; **Pages** &rarr; **Connect to Git**.
3. Select your repository and configure the build settings:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
   - **Root directory:** `/` *(leave empty or default)*
4. Under **Environment variables (advanced)**, add:
   - **Variable name:** `APP_PASSWORD`
   - **Value:** `<YourSecurePassword>` (or `DISABLED` for public access)
5. Click **Save and Deploy**.

Cloudflare automatically compiles the Vite frontend and attaches the edge middleware in `/functions` to protect all routes.

---

## 🛠️ Local Development

### Prerequisites
- Node.js 18+ (tested on Node.js 22 & 24)
- npm 9+

### Commands

```bash
# 1. Install dependencies
npm install

# 2. Run local development server (Vite on port 3000)
npm run dev

# 3. Build production bundle (tsc -b && vite build)
npm run build

# 4. Preview production build locally (Vite preview)
npm run preview

# 5. Preview production build with Cloudflare Pages Functions (Wrangler)
npm run preview:pages
```

---

## 🐙 GitHub Setup

To prepare and push this project to GitHub:

```bash
# 1. Initialize git repository
git init -b main

# 2. Stage all project files
git add .

# 3. Create initial commit
git commit -m "feat: initial commit of Canvas AI Canary Studio for Cloudflare Pages"

# 4. Add your GitHub remote repository
git remote add origin https://github.com/Arsydian/Canary_Studio.git

# 5. Push to GitHub
git push -u origin main
```

---

## 📁 Project Structure

```text
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions build & typecheck CI
├── functions/
│   └── _middleware.ts           # Cloudflare Pages edge HTTP Basic Auth middleware
├── public/
│   └── _headers                 # Edge security headers & caching configuration
├── src/
│   ├── canaryEngine.ts          # Core integrity algorithms (HTML, Unicode, PDF, Discussion, Auditor)
│   ├── App.tsx                  # Interactive React application UI & dual previews
│   ├── main.tsx                 # React entry point
│   └── index.css                # Tailwind CSS imports & global styles
├── INSTRUCTOR_GUIDE.md          # Step-by-step non-technical guide for faculty
├── README.md                    # Project documentation
├── index.html                   # HTML template
├── package.json                 # Project configuration & npm scripts
├── postcss.config.js            # PostCSS configuration
├── tailwind.config.js           # Tailwind CSS configuration
├── tsconfig.json                # TypeScript compiler configuration
└── vite.config.ts               # Vite bundler configuration
```

---

## 📄 License

MIT License. Designed for academic integrity education, instructional design research, and course administration.
