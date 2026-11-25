import type { RepositoryContent } from "@/lib/types";

// Product-page content for vikasswebdev/OpenSEO.
// Every claim and command comes from the repository's README.md, HOW_TO_USE.md and
// pyproject.toml at commit 7ea75c7 (2026-07-21), read on 2026-11-24.
// Our own observations are labeled as such (PyPI check, star count date).

const README = "https://github.com/vikasswebdev/OpenSEO/blob/7ea75c74b3c1d1e804957fa516f323ab5bb71998/README.md";
const HOW_TO = "https://github.com/vikasswebdev/OpenSEO/blob/7ea75c74b3c1d1e804957fa516f323ab5bb71998/HOW_TO_USE.md";
const PYPROJECT = "https://github.com/vikasswebdev/OpenSEO/blob/7ea75c74b3c1d1e804957fa516f323ab5bb71998/pyproject.toml";

const cloneAndEnter = {
  title: "Clone the repository",
  body: "The README's clone URL points to github.com/openseo/openseo. This uses the repository's actual location.",
  code: "git clone https://github.com/vikasswebdev/OpenSEO.git\ncd OpenSEO",
  lang: "bash" as const,
};

const installEditable = {
  title: "Install OpenSEO in editable mode",
  body: "Core install. Add the [all] extra and Playwright's Chromium only if you need JavaScript rendering.",
  code: "pip install -e .\n\n# Optional: JavaScript rendering and dev tools\npip install -e \".[all]\"\nplaywright install chromium",
  lang: "bash" as const,
};

export const openseoContent: RepositoryContent = {
  sourceUrls: [README, HOW_TO, PYPROJECT],
  sourceCommitSha: "7ea75c74b3c1d1e804957fa516f323ab5bb71998",
  lastReviewedAt: "2026-11-24",
  heroCommands: [
    { comment: "Set up your default provider", command: "seo init" },
    { comment: "Check keys, cache and connectivity", command: "seo doctor" },
    { comment: "Audit a site and save a PDF report", command: "seo audit https://example.com --report" },
  ],
  sixtySeconds: {
    whatItDoes:
      "OpenSEO is a command-line tool that crawls a website, runs rule-based SEO checks on the HTML (titles, images, links and more), and asks a language model of your choice to turn the findings into recommendations.",
    problem:
      "AI-assisted SEO tools are usually hosted services tied to one AI vendor. OpenSEO runs on your own machine and lets you switch providers, including fully local models through Ollama.",
    whoFor: [
      "Developers who want SEO audits they can script from the terminal",
      "Marketers and SEO professionals comfortable with a command line",
      "Teams that need to pick their own LLM provider or keep data local",
      "Engineers who want to catch SEO regressions between deploys",
    ],
    whyChoose:
      "Choose it if you want an open-source, scriptable audit where you control the model and your data. If you want a hosted dashboard with no setup, this isn't that.",
    requirements: [
      "Python 3.11 or newer",
      "Git, to install from source",
      "An API key for a hosted LLM provider, or Ollama running locally",
      "Optional: Playwright Chromium for JavaScript-rendered sites",
    ],
  },
  overview: [
    "OpenSEO combines two kinds of checks. Rule-based analyzers parse each crawled page for technical issues, then an LLM reviews the results and writes recommendations. Prompts are plain Markdown templates in the repository, so you can read and edit exactly what the model is asked.",
    "Model access goes through LiteLLM, which is why one interface works with OpenAI, Anthropic Claude, Google Gemini, Groq, DeepSeek, Together AI, Fireworks, Ollama and other OpenAI-compatible endpoints. Responses are cached locally in SQLite so repeated audits don't repeat API calls.",
    "Beyond the main audit, the CLI includes content analysis against a target keyword, Schema.org JSON-LD generation, sitemap and robots.txt checks, keyword clustering, PDF reports, and \"drift\" snapshots that compare a page's SEO-relevant structure before and after a deploy.",
  ],
  features: [
    { icon: "scan-search", title: "Full SEO audit", body: "Rules-based HTML checks plus LLM-written recommendations, with optional sitemap-only crawling and a PDF report." },
    { icon: "layers", title: "Any LLM provider", body: "Switch between OpenAI, Claude, Gemini, Groq, Ollama and more with one command, via LiteLLM." },
    { icon: "shield", title: "Local and private", body: "Point it at a local Ollama model and audits run without sending pages to a hosted AI service." },
    { icon: "file-code", title: "Editable prompts", body: "Prompts live as Markdown templates, not hardcoded strings, so you can tune them for your niche." },
    { icon: "git-compare", title: "SEO drift checks", body: "Capture a baseline and compare later to catch lost canonicals, noindex changes or missing schema." },
    { icon: "puzzle", title: "Plugins and caching", body: "Plugin architecture for custom commands and providers; SQLite cache with configurable TTL." },
  ],
  strengths: [
    "Not locked to one AI vendor, and works with free local models",
    "Readable, editable prompts make the AI part transparent",
    "Covers more than audits: content, schema, drift, sitemap and robots.txt checks",
    "MIT licensed, so it's fine for commercial use",
  ],
  limitations: [
    "Early stage: version 0.1.0, marked \"Alpha\" in its package metadata",
    "Not on PyPI when we checked (Nov 24, 2026), even though the README shows pip install openseo. Install from source instead",
    "Small community so far (5 stars, 3 forks on Nov 24, 2026), so fewer answers exist online",
    "Pins LiteLLM 1.40.0, so give it its own virtual environment",
    "Recommendation quality depends on the model you choose; hosted models cost money per request",
  ],
  useCases: [
    { title: "Pre-launch audit", body: "Crawl a staging site, review issues in the terminal and hand the PDF report to your team." },
    { title: "Content optimization", body: "Run seo content with a target keyword to find gaps in a blog post." },
    { title: "Structured data", body: "Generate Schema.org JSON-LD for an article or profile page with seo schema." },
    { title: "Regression guard", body: "Take a drift baseline of key pages, then compare after each deploy." },
  ],
  install: {
    verification: "official_docs",
    verificationNote:
      "Commands come from OpenSEO's README and HOW_TO_USE guide. AIRepoHub hasn't run them yet.",
    sourceUrl: README,
    prerequisites: ["Python 3.11+", "pip", "Git"],
    supportedOs: ["Windows", "macOS", "Linux"],
    guides: [
      {
        os: "macos",
        label: "macOS",
        method: "source",
        steps: [
          cloneAndEnter,
          { title: "Create and activate a virtual environment", code: "python -m venv .venv\nsource .venv/bin/activate", lang: "bash" },
          installEditable,
        ],
      },
      {
        os: "linux",
        label: "Linux",
        method: "source",
        steps: [
          cloneAndEnter,
          { title: "Create and activate a virtual environment", code: "python -m venv .venv\nsource .venv/bin/activate", lang: "bash" },
          installEditable,
        ],
      },
      {
        os: "windows",
        label: "Windows",
        method: "source",
        steps: [
          { ...cloneAndEnter, lang: "powershell" },
          { title: "Create and activate a virtual environment (PowerShell)", code: "python -m venv .venv\n.venv\\Scripts\\Activate.ps1", lang: "powershell" },
          { ...installEditable, lang: "powershell" },
        ],
      },
    ],
    environment: [
      { name: "OPENAI_API_KEY", required: false, description: "Needed only when using OpenAI. The README recommends environment variables for keys." },
      { name: "seo provider set-key <provider> <key>", required: false, description: "Alternative: store a key for any provider (anthropic, gemini, groq…) in OpenSEO's config." },
      { name: "~/.openseo/config.json", required: false, description: "Created by seo init. Holds your default provider, model, cache and output settings." },
    ],
    firstRun: [
      { title: "Initialize configuration", body: "Interactive wizard for your default provider and settings.", code: "seo init", lang: "bash" },
      { title: "Add an API key (skip if using Ollama)", code: "export OPENAI_API_KEY=\"sk-...\"", lang: "bash" },
      { title: "Verify the installation", code: "seo doctor", lang: "bash" },
      { title: "Run your first audit", code: "seo audit https://example.com", lang: "bash" },
    ],
    expectedOutput: null,
  },
  tutorial: {
    title: "Run a private SEO audit with a local model",
    useCase:
      "Audit your website with a model running on your own computer, so no page content goes to a hosted AI provider and there are no API fees.",
    setup: ["OpenSEO installed (see Installation)", "Ollama installed and running", "Enough memory and disk for the model you pull (see Ollama's docs)"],
    steps: [
      { title: "Check that Ollama is running", code: "ollama list", lang: "bash" },
      { title: "Download a model", code: "ollama pull llama3.1", lang: "bash" },
      { title: "Point OpenSEO at it", code: "seo provider use ollama --model ollama/llama3.1", lang: "bash" },
      { title: "Audit your site and generate a report", code: "seo audit https://your-site.com --report", lang: "bash" },
    ],
    expected:
      "OpenSEO crawls the site, runs its rule-based checks and adds AI recommendations from the local model. With --report it saves a page-by-page PDF (scorecards, consolidated issues and an AI roadmap) in a results/ folder.",
    nextSteps: [
      "Audit every sitemap URL: seo audit https://your-site.com --sitemap-only --max-pages 0",
      "Check a post against a keyword: seo content <url> --keyword \"your keyword\"",
      "Save a drift baseline before your next deploy: seo drift baseline <url>",
    ],
    sourceUrl: README,
  },
  costs: [
    { label: "License", value: "MIT. Free to use, modify and use commercially.", tone: "free" },
    { label: "Software", value: "Free and open source. Runs on your machine, so there's nothing to host.", tone: "free" },
    { label: "Hosted AI providers", value: "Billed per token by your provider (OpenAI, Anthropic, Google…). Cost grows with pages audited and model size.", tone: "paid" },
    { label: "Local models", value: "No API fees with Ollama, but you need hardware that can run your chosen model.", tone: "depends" },
    { label: "Optional extras", value: "Playwright Chromium for JavaScript rendering is free to download.", tone: "free" },
  ],
  troubleshooting: [
    {
      problem: "pip install openseo can't find the package",
      solution: "OpenSEO wasn't published on PyPI when we checked (Nov 24, 2026). Install from source with pip install -e . as shown above.",
    },
    {
      problem: "The seo command is missing or runs old code",
      solution: "Activate your virtual environment and install in editable mode (pip install -e .) so the seo command points at the source you cloned.",
      sourceUrl: HOW_TO,
    },
    {
      problem: "API key or connection problems",
      solution: "Run seo doctor. It checks API keys, the cache database, Playwright and internet connectivity.",
      sourceUrl: HOW_TO,
    },
    {
      problem: "Audits with Ollama fail",
      solution: "Make sure Ollama is running (ollama list) and that you pulled the model first, for example ollama pull llama3.1.",
      sourceUrl: README,
    },
    {
      problem: "Content on JavaScript-heavy sites is missing",
      solution: "Install the extras and Chromium: pip install -e \".[all]\" then playwright install chromium.",
      sourceUrl: README,
    },
  ],
  bestFor: [
    "Developers who want SEO audits in the terminal or CI scripts",
    "SEO professionals who want AI recommendations without vendor lock-in",
    "Privacy-conscious teams running local models",
  ],
  facts: [
    { label: "Type", value: "CLI tool" },
    { label: "Language", value: "Python 3.11+" },
    { label: "License", value: "MIT" },
    { label: "Setup", value: "Intermediate" },
    { label: "Version", value: "0.1.0 (Alpha)" },
  ],
};
