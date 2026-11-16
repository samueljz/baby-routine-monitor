# Baby Routine Monitor

A mobile-first Vue 3 single-page application for tracking baby feedings (Latching & Bottle Feed) and diaper changes (Urine & Poop), featuring interactive charts, dark/light themes, local JSON backup/restore, and Google Drive synchronization.

## Features

- **Smart Feeding Logs**:
  - **Bottle Feed**: Select milk type (**Breast Milk** or **Formula Milk**) and volume (`ml`) with quick `−10` / `+10` steppers.
  - **Latching**: Dynamically switches to **Breast Side** (`Left` / `Right` / `Both`) and optional **Duration (`mins`)**.
- **Diaper Change Logs**:
  - Track **Urine (Wet)** and **Poop (Dirty)** diaper changes with timestamps and relative time indicators.
- **Interactive Summary Charts**:
  - **Last 36 Hours**: Visualizes individual feed timings and volumes (`ml`) alongside latching durations.
  - **Last 7 Days**: Stacked daily milk volume summary with tooltip breakdowns.
- **Backup & Google Drive Integration**:
  - Automatic debounced sync to Google Drive (`BabyRoutineMonitorBackup.json`) with conflict resolution modal.
  - Local JSON file **Export** and **Import** (Merge or Overwrite) in the **Manage** tab.

## Project Setup

```sh
npm install
```

### Configure Google Drive Sync (Optional)

Copy `.env.example` to `.env` and add your Google OAuth 2.0 Client ID:

```sh
cp .env.example .env
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```
