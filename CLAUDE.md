# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a sushi flashcard application built with React. The main component is a single-file React application (`sushi_flashcard.tsx`) that implements an intelligent spaced repetition system for learning sushi terminology in Japanese, Korean, and English.

## Architecture

### Core Components
- **Single File Application**: The entire application is contained in `sushi_flashcard.tsx`
- **Data Loading**: Expects a CSV file `sushi_netalist_full.csv` with columns: 한자, 가나, 한국어명, 제철 시작, 제철 끝, 고급 여부
- **File System Access**: Uses `window.fs.readFile()` API (likely Electron or similar desktop app framework)
- **CSV Processing**: Dynamically imports PapaParse library for CSV parsing

### Key Features
- **Spaced Repetition Algorithm**: Advanced scheduling system with response time tracking
- **Weighted Card Selection**: Cards appear based on difficulty, due dates, and performance
- **Progress Tracking**: Response times, accuracy rates, and review intervals
- **Data Import/Export**: CSV-based backup and restore functionality
- **Card Management**: Add/remove cards dynamically

### State Management
The application uses React hooks for state management with multiple interconnected states:
- `sushiData`: Main card data array
- `cardStats`: Per-card statistics and scheduling information
- `studyHistory`: Complete learning session history
- `weightedDeck`: Current deck of cards weighted by difficulty

### Algorithm Details
- **Initial Intervals**: 30 seconds → 2 minutes → 8 minutes → 25 minutes → 60 minutes → exponential growth
- **Response Time Categories**: Perfect (≤3s), Good (≤8s), Slow (≤15s), Very Slow (>15s)
- **Penalty System**: Slower responses reduce interval growth and increase card weight
- **Incorrect Answers**: Reset to 10-second interval with increased weight

## Development Notes

- The application appears to be designed for a desktop environment with file system access
- No build system configuration files present - likely compiled externally
- Uses Tailwind CSS for styling
- Implements custom 3D card flip animations with CSS transforms