# Day4ai — Project & Ideas Catalog

> **Last updated:** March 5, 2026  
> A living document of every project and idea we've built together.

---

## 🤖 AI Agent Infrastructure

### 1. C-Suite AI Agents (Discord Bot + n8n)
**Status:** ✅ Live  
**Stack:** Node.js · Discord.js · n8n · PostgreSQL · Qdrant · Gemini API · Docker  
A team of three AI-powered C-suite executives — **Chief of Staff**, **Chief Automation Officer**, and **Chief Strategy Officer** — that operate as always-on business partners via Discord. Each agent has a distinct personality and expertise. They run on a self-hosted VPS using n8n for workflow orchestration, PostgreSQL for conversation memory, and Qdrant for vector-based knowledge search. Includes a **Roundtable** feature where all three agents weigh in on a single topic and the CSO synthesizes a final recommendation.

### 2. Sentinel (Security Officer)
**Status:** ✅ Live  
**Stack:** Node.js · Discord.js · PostgreSQL  
A security-focused agent that monitors all bot activity for threats, anomalies, and agent loop detection. Features rate limiting (warning → throttle → lockdown), message scanning, and a dedicated `#security-officer` Discord channel for real-time security conversations and `!sentinel` commands. Includes API key rotation reminders and autonomy level enforcement.

### 3. Empire Engine
**Status:** 🔨 In Development  
**Stack:** Python · Flask · Docker · Claude Code CLI  
An API bridge system that dispatches automated tasks to specialized "engines" running on the VPS. Each engine handles a different revenue stream: **digital products**, **print-on-demand (PoD)**, **affiliate marketing**, **ebooks**, and **influencer outreach**. Tasks are dispatched via a REST API and executed through Claude Code CLI with a 10-minute timeout per task. Includes a scheduler for automated recurring jobs.

---

## 💼 SaaS / Business Applications

### 4. FairScreen Pro
**Status:** 🔨 In Development  
**Stack:** React (Vite) · Firebase · Node.js  
A tenant screening platform designed to make the rental application process fair, transparent, and compliant. Features an admin dashboard for managing screening workflows, applicant data, and compliance rules. Built with a modern React frontend and Firebase backend.  
*(**Today's Update:** Fixed broken frontend UI components including Sidebar, SettingsPanel, and AgentForm, and successfully set up the local development environment to test the new admin dashboard.)*

### 5. TrueAudit
**Status:** 🔨 In Development  
**Stack:** React · Firebase  
A credential tracking and compliance portal for healthcare organizations. Tracks employee certifications, expiration dates, and audit readiness. Features include requisition/job mapping, global search, interactive dashboard drill-downs, estimated start date tracking, expandable table rows for credential details, and a light/dark mode toggle. Includes a data ingestion pipeline for external systems.

### 6. CertiTrack
**Status:** 📋 Investor-Ready  
**Stack:** React · Firebase  
A certification and credential management platform. Tracks professional certifications, automates renewal reminders, and provides compliance dashboards. Currently being prepared for investor presentations with a pitch deck and sizzle video assets.

---

## 🎮 Consumer / Entertainment

### 7. D&D Sim4Fun
**Status:** ✅ Live (Firebase project active)  
**Stack:** Firebase  
A Dungeons & Dragons simulation game. Connected to the Day4ai agent infrastructure — GitHub activity from the `dnd-sim4fun` repo is included in the C-Suite daily briefings.

### 8. OpenClaw / ClawDeploy
**Status:** ✅ Active  
**Stack:** Firebase  
A claw machine game/deployment platform. Connected to the Day4ai agent ecosystem via the `openclaw-daybot` GitHub repo and monitored by the C-Suite daily briefings.

---

## 🏠 Real Estate / Property Management

### 9. STR Manager & Rental Analyzer
**Status:** ✅ Firebase projects active  
**Stack:** Firebase  
Short-term rental management and analysis tools. Includes both an **STR Manager** (`str-manager-5b401`) for property management and an **STR Rental Analyzer** (`str-rental-analyzer`) for investment analysis. Also connected to the **Yosemite Sanctuary** (`yosemite-sanctuary`) and **DaysRentals** properties.

---

## 💰 Passive Income / E-Commerce

### 10. Print-on-Demand (PoD) Design System
**Status:** 🔨 In Development  
**Stack:** Python · AI Image APIs  
An AI-powered design pipeline for creating print-on-demand products (clothing, accessories). Focuses on generating high-quality, marketable designs with proper typography, contrast, and transparent background handling. Integrated into the Empire Engine as the `pod` engine for automated design generation and store listing.

### 11. Parlay Bot
**Status:** ✅ Deployed  
**Stack:** HTML · CSS · JavaScript  
A sports betting parlay analysis tool. Features password-protected access for private use. Provides analysis and recommendations for sports betting parlays.  
*(**Today's Update:** Successfully deployed the application to the Hostinger domain `day4ai.tech` via GitHub Pages with a custom domain instead of direct FTP.)*

---

## 🛡️ Infrastructure & DevOps

### 12. Day4ai Hub (Firebase Central)
**Status:** ✅ Live  
**Stack:** Firebase (Firestore · Auth)  
The central nervous system for all Day4ai ventures. A Firebase project (`day4ai-hub`) that stores agent state, shared knowledge, cross-project task tracking, and generated reports. Provides a unified view across all portfolio ventures.

### 13. VPS Infrastructure (Root4VPS)
**Status:** ✅ Live  
**Stack:** Docker · Nginx · Tailscale · Let's Encrypt  
The Hostinger VPS (32GB RAM, 8 vCPU) running Ubuntu that hosts the entire Day4ai stack. Managed via Tailscale for secure remote access. Runs Docker Compose stacks for n8n, PostgreSQL, Qdrant, Discord bot, and the Empire Engine. Accessible at `agents.day4ai.tech`.

---

## 📊 Summary

| # | Project | Category | Status |
|---|---------|----------|--------|
| 1 | C-Suite AI Agents | AI Infrastructure | ✅ Live |
| 2 | Sentinel | Security | ✅ Live |
| 3 | Empire Engine | Automation | 🔨 In Dev |
| 4 | FairScreen Pro | SaaS | 🔨 In Dev |
| 5 | TrueAudit | SaaS | 🔨 In Dev |
| 6 | CertiTrack | SaaS | 📋 Investor-Ready |
| 7 | D&D Sim4Fun | Entertainment | ✅ Live |
| 8 | OpenClaw / ClawDeploy | Entertainment | ✅ Active |
| 9 | STR Manager & Analyzer | Real Estate | ✅ Active |
| 10 | PoD Design System | E-Commerce | 🔨 In Dev |
| 11 | Parlay Bot | Sports/Tools | ✅ Deployed |
| 12 | Day4ai Hub | Infrastructure | ✅ Live |
| 13 | VPS Infrastructure | DevOps | ✅ Live |
