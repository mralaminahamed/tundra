---
title: File Manager
description: Browse, edit, upload, and manage files directly in the Tundra panel.
---

## Opening the file manager

- Go to **Sites → [site] → Files**, or
- Click the **Files** link from any site overview card.

## Features

### In-browser editor

Click any text file to open it in the built-in CodeMirror editor:

- Syntax highlighting (50+ languages auto-detected by extension)
- Dark and light mode, follows panel theme
- Save with **Ctrl+S** / **Cmd+S**
- Files are written directly to the server via the agent

### Directory tree

The left sidebar shows the full directory tree, loaded lazily from the API. Click any directory to expand it. The current path is shown in the breadcrumb.

### File operations

Right-click any file or directory for the context menu:

| Action | Details |
|--------|---------|
| **Edit** | Open in CodeMirror editor |
| **Rename** | Inline rename |
| **Copy** | Copy to another path on the same server |
| **Move** | Move/rename to another path |
| **Download** | Download file, or download directory as a `.zip` |
| **Delete** | Delete file or directory tree (confirmation required) |

### Upload

Drag files onto the file manager or click **Upload** to select files. Multiple files are supported. Uploads use multipart form data.

### Download directory as ZIP

Right-click a directory → **Download** — Tundra creates a ZIP archive on-the-fly and streams it to your browser.

## File icons

The file manager shows SVG icons for 51 file types, including:

- Source: `.rs`, `.ts`, `.tsx`, `.py`, `.go`, `.rb`, `.php`, `.java`, `.cs`
- Config: `.toml`, `.yaml`, `.json`, `.env`, `.xml`
- Documents: `.md`, `.pdf`, `.txt`
- Media: `.png`, `.jpg`, `.mp4`, `.mp3`
- Archives: `.zip`, `.tar.gz`, `.zst`
- WordPress-specific: `.php`, `wp-config.php`

## Security

- Files are accessed via the `tundra-agent` over mTLS — no direct SSH/SFTP exposure
- The agent enforces that paths are within the site's document root
- All file write operations are recorded in the audit log
