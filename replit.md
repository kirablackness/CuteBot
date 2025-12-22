# Media Download Bot Dashboard

## Overview

A full-stack TypeScript application featuring a Telegram bot for downloading media from various platforms (YouTube, TikTok, Instagram, Yandex Music) paired with a real-time analytics dashboard. The bot handles media downloads and logs activity to a PostgreSQL database, while the React frontend displays download statistics, platform distribution charts, and recent activity.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight router)
- **State Management**: TanStack Query (React Query) for server state with 5-second polling for live updates
- **Styling**: Tailwind CSS with shadcn/ui components (New York style)
- **Animations**: Framer Motion for entry animations and interactions
- **Charts**: Recharts for platform distribution visualization
- **Theme**: "Neon Cyber" dark theme with custom CSS variables for vibrant accents (cyan, purple, pink)
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript (ESM modules)
- **Bot Framework**: Telegraf for Telegram bot integration
- **Database ORM**: Drizzle ORM with Zod schema validation
- **API Pattern**: Simple REST endpoint (`/api/stats`) serving aggregated download statistics

### Data Storage
- **Database**: PostgreSQL via Neon serverless driver (`@neondatabase/serverless`)
- **Schema**: Single `downloads` table tracking platform, URL, file size, status, and timestamp
- **Migrations**: Drizzle Kit for schema management (`drizzle-kit push`)

### Key Design Decisions

1. **Monorepo Structure**: Client, server, and shared code in single repository with path aliases (`@/`, `@shared/`)
2. **Shared Types**: Schema definitions in `shared/schema.ts` used by both frontend and backend via Drizzle-Zod
3. **Type-Safe API Routes**: Route definitions in `shared/routes.ts` with Zod response schemas for validation
4. **Background Tasks**: Cleanup task runs every 6 hours to remove old temporary files from bot downloads
5. **Database Seeding**: Auto-seeds with sample data if empty for demo purposes

### Build Configuration
- **Development**: TSX for TypeScript execution, Vite dev server with HMR
- **Production**: esbuild bundles server code, Vite builds client to `dist/public`
- **Bundling Strategy**: Server bundles common dependencies to reduce cold start times

## External Dependencies

### Database
- **Neon PostgreSQL**: Serverless Postgres with WebSocket support for connection pooling
- **Connection**: Requires `DATABASE_URL` environment variable

### Third-Party Services
- **Telegram Bot API**: Via Telegraf library, requires `BOT_TOKEN` environment variable
- **External Download Tools**: Bot uses system commands (yt-dlp or similar) for media extraction

### Key NPM Packages
- `@neondatabase/serverless`: PostgreSQL driver
- `drizzle-orm` / `drizzle-kit`: Database ORM and migrations
- `telegraf`: Telegram bot framework
- `@tanstack/react-query`: Data fetching and caching
- `recharts`: Chart visualization
- `framer-motion`: Animations
- `shadcn/ui` components: Built on Radix UI primitives

### Replit-Specific
- `@replit/vite-plugin-runtime-error-modal`: Error overlay in development
- `@replit/vite-plugin-cartographer`: Development tooling
- `@replit/vite-plugin-dev-banner`: Development banner