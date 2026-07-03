# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Nephthys Blog — a blog project built with Vite, React 19, and TypeScript. Currently still at the initial Vite scaffold stage (`src/App.tsx` contains the default template); the actual blog has not been built yet.

## Commands

- `npm run dev` — start the Vite dev server with HMR
- `npm run build` — type-check (`tsc -b`) then build for production with Vite
- `npm run lint` — run ESLint over the repo
- `npm run preview` — serve the production build locally

There is no test framework configured yet.

## Architecture

- Single-page React app. Entry point is `src/main.tsx`, which renders `src/App.tsx` into `#root` in `index.html`.
- TypeScript uses project references: `tsconfig.app.json` (app code in `src/`) and `tsconfig.node.json` (Vite config). Strict mode is enabled with `noUnusedLocals`/`noUnusedParameters`, so unused code fails the build.
- ESLint is flat-config (`eslint.config.js`) with typescript-eslint, react-hooks, and react-refresh rules applied to `**/*.{ts,tsx}`.
- Static assets: `public/` files are served at the root (e.g. `/icons.svg`), while imports from `src/assets/` are bundled by Vite.
- Commit messages in this repo are written in Korean.
