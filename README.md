# NicheRadar

![Status](https://img.shields.io/badge/status-under%20development-yellow)
![License](https://img.shields.io/badge/license-MIT-blue)

A free, open-source tool to detect design and aesthetic trends **before they
saturate** marketplaces like Etsy — built for creators of clip art and
AI-generated digital assets.

## Why

Tools like eRank or Alura solve this problem, but they're paid and
closed-source. NicheRadar aims to offer the essentials — Google Trends search
volume tracking, rising related searches, and (optionally) cross-referencing
with real Etsy listings to measure market saturation — for free, transparently,
and easy to self-host.

Born as a personal project for [Kliparama](https://www.etsy.com/shop/Kliparama)
(my clip art shop on Etsy) and as a technical portfolio piece.

## Tech Stack

- **Backend:** TypeScript + Express
- **Database:** PostgreSQL (via Docker Compose)
- **ORM:** Drizzle ORM + drizzle-kit
- **Trend data:** Google Trends (no API key required)
- **Optional integration:** Etsy Open API v3 (requires your own API key)
- **Dashboard:** TBD (will be documented once that phase is reached)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or higher
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (to run PostgreSQL)

### Setup

1. Clone the repo:
```bash
   git clone https://github.com/arambs22/Niche-Radar.git
   cd Niche-Radar
```

2. Install dependencies:
```bash
   npm install
```

3. Copy the environment variables file and adjust if needed:
```bash
   cp .env.example .env
```

4. Start PostgreSQL with Docker Compose:
```bash
   docker compose up -d
```

5. Start the development server (hot-reload):
```bash
   npm run dev
```

6. Verify everything is connected. The server runs on `http://localhost:3000`
   by default. Check the health endpoint:
```bash
   curl http://localhost:3000/health
```

   Expected response:
```json
   {
     "status": "ok",
     "database": "connected",
     "etsyIntegration": "disabled"
   }
```

   `etsyIntegration` will show `"disabled"` unless you've configured an Etsy
   API key in your `.env` file — Etsy integration is optional and the app
   works fully without it, using Google Trends data only.

## Project Status

🚧 Actively under development. See open [issues](https://github.com/arambs22/Niche-Radar/issues)
and the commit history for current progress.

## License

[MIT](./LICENSE) © 2026 Aram Barsegyan