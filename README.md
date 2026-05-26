# 🚀 NeoVision

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Web-lightgrey)]()
[![Tech Stack](https://img.shields.io/badge/stack-Node.js%20%7C%20C%23%20.NET%208%20%7C%20React%20TS-orange)]()

NeoVision is a fully functional **cross-network remote desktop support tool** — similar to TeamViewer or AnyDesk, but entirely self-owned and built from scratch. It empowers admins to connect to client machines worldwide, view screens live, control input, transfer files, run programs, and capture screenshots — all through a secure relay server you control.

---

## 📦 What I've Built
- Secure relay server for communication
- Lightweight Windows client agent
- Web-based admin dashboard

---

## 🧩 The Three Components

### 1. Relay Server
- Hosted on **Render.com**
- Built with **Node.js + Express**
- Handles:
  - Admin authentication (JWT + bcrypt)
  - Client registration
  - WebSocket session brokering
  - PostgreSQL storage (Supabase)
  - Redis presence tracking (Upstash)
  - Routing of frames, inputs, and file transfers

### 2. Client Agent
- Built in **C# .NET 8**
- Runs silently with tray icon
- Features:
  - Screen capture via GDI BitBlt (JPEG @ 15 FPS)
  - Input injection via Windows SendInput API
  - File transfer + program execution
  - Auto-reconnect on drop
- Distributed as a **self-contained executable** with NSIS installer

### 3. Admin Dashboard
- Built in **React 18 + TypeScript (Vite)**
- Deployed on **Vercel**
- Features:
  - Client list with live status
  - Connect to sessions
  - Live screen rendering on canvas
  - Mouse/keyboard forwarding
  - File transfer, command execution, screenshot capture

---

## 🛠️ Technology Stack

| Component        | Tech Used                                                                 |
|------------------|---------------------------------------------------------------------------|
| Relay Server     | Node.js, Express, ws, PostgreSQL (Supabase), Redis (Upstash), Docker      |
| Client Agent     | C# .NET 8, GDI BitBlt, SendInput API, System.Net.WebSockets, NSIS         |
| Admin Dashboard  | React 18, TypeScript, Vite, Zustand, Axios, HTML Canvas                   |
| Infrastructure   | Render.com, Supabase, Upstash, Vercel, UptimeRobot                        |

---

---

## 🔌 How the Connection Works
1. **Client boots** → Agent connects to relay via WebSocket (`AGENT_REGISTER`).
2. **Admin logs in** → Dashboard authenticates via REST, receives JWT, opens WebSocket (`ADMIN_AUTH`).
3. **Admin connects** → Relay pairs sockets, creates session record, starts screen capture.
4. **Session active** → Frames stream to dashboard, inputs injected on client.
5. **Session ends** → Relay records end time, notifies both sides.

---

## 📅 Build Order
1. Relay server, DB schema, auth, deployment
2. Windows agent (screen capture, input, file handling)
3. React dashboard (login, client list, session management)
4. End-to-end integration + bug fixes
5. NSIS installer + Vercel deployment

---



## 📜 License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
