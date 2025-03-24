## "Vibe Coding"
This project was an experiment in using the Cursor IDE to build something slightly pointless, that I otherwise wouldn't have spent the time to build. I found it interesting how it trended towards building everything in a one big file, and that code quality declined over time, overall my conclusions is AI is coming for our jobs and we're all screwed. Enjoy.

https://www.tiktok.com/@stockbottom

# TikTok Stock Investment Video Generator

This tool automatically generates TikTok videos showing the growth of hypothetical stock investments over time. The videos feature animated graphs that visualize how a monthly investment would have performed over a specified period.

Todo:
- Auto video upload.
- Auto image sourcing.
- Different video scenarios.

## Prerequisites

- Node.js (v14 or higher)
- FFmpeg installed on your system
- TypeScript

## Installation

1. Clone this repository
2. Install dependencies:
```bash
npm install
```

## Usage

1. Run:
```bash
npx ts-node src/index.ts \
  --ticker DIS \
  --start 2001-01-01 \
  --end 2025-03-18 \
  --monthly 100 \
  --balance 0 \
  --period monthly \
  --title "What if you invested \$100 monthly into Disney since 2001?" \
  --image ./imgs/disney.png \
  --output disney_investment.mp4
```
