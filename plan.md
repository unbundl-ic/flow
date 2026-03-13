# Implementation Plan: Next.js + Playwright Automation Platform

## 1. Project Scaffolding
- [x] Initialize Next.js 14+ (App Router) project with TypeScript and Tailwind CSS.
- [x] Install core dependencies:
  - `playwright`: Browser automation.
  - `mongoose`: MongoDB object modeling.
  - `axios`: For PageSpeed Insights API requests.
  - `lucide-react`, `clsx`, `tailwind-merge`: UI utilities.
  - `react-hook-form`, `zod`, `sonner`: Form and notifications.
- [ ] Configure `shadcn/ui` for rapid UI development (Tabs, Cards, Buttons, Inputs).

## 2. Database Architecture (MongoDB)
- [ ] Set up `lib/db.ts` for MongoDB connection caching.
- [ ] Define Mongoose Models:
  - **Brand**: Stores metadata (name, startUrl, enabled).
  - **Job**: Tracks automation runs (status, logs, result summary).
  - **ProductReport**: Stores scraped product data and availability.
  - **PageSpeedReport**: Stores PSI metrics for specific URLs.

## 3. Automation Engine (Core Logic)
- [ ] Create `lib/automation/types.ts`: Define `BrandStrategy` interface.
- [ ] Implement `BrowserFactory`: Singleton to manage Playwright browser contexts.
- [ ] Create Base Strategy Class:
  - Methods: `submitForm`, `scrapeCollection`, `runPageSpeedTest`.
  - Feature: "Human-in-the-loop" pause mechanism for Captchas.

## 4. Brand Strategies (The "Brand Tab" Logic)
- [ ] Create `lib/brands/registry.ts`: Map brand IDs to their code strategies.
- [ ] Implement Example Brand A (Form Submission Flow):
  - Navigates to contact page.
  - Fills form.
  - Pauses/Waits for manual Captcha or "Thank You" selector.
- [ ] Implement Example Brand B (Collection Scraping Flow):
  - Navigates to collection URL.
  - Scrapes product links.
  - Visits each product to check variants.

## 5. API Routes (Server-Side Execution)
- [ ] `POST /api/run`: Accepts `brandId` and `taskType`.
  - Instantiates the correct strategy.
  - Runs the Playwright script (headless: false for local dev visibility).
  - Updates `Job` status in real-time (or at end).
- [ ] `GET /api/jobs`: List recent automation runs.
- [ ] `GET /api/reports`: View aggregated data.

## 6. Frontend UI
- [ ] **Dashboard**: Overview of recent jobs and quick stats.
- [ ] **Brand Configuration**:
  - Tabbed interface to select a brand.
  - Inputs for dynamic data (e.g., "Collection URL" to scrape).
  - "Start Automation" button.
- [ ] **Live Logs**: Simple polling component to show job progress.
- [ ] **Reports View**: Table displaying scraped products and PSI scores.

## 7. PageSpeed Insights Integration
- [ ] Create `lib/psi.ts`: Helper to fetch Core Web Vitals.
- [ ] Integrate into the "Scrape" flow (optional: check PSI for every scraped product).

## 8. Environment Setup
- [ ] Configure `.env` for `MONGODB_URI` and `PAGESPEED_API_KEY`.
