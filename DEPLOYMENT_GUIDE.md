# 🍜 NextGenOS Restaurant Operating System — Deployment Guide

This guide explains how to deploy and configure the decoupled **Customer Storefront** and **Administrative POS/Operations** portals.

---

## 💡 The Core Concept

To satisfy security directives, optimize bundle sizes, and isolate local databases (IndexedDB), the storefront and staff POS are split using a compile-time environment variable:

* `NEXT_PUBLIC_APP_PORTAL=customer` — Customer Storefront Only.
* `NEXT_PUBLIC_APP_PORTAL=pos` — Staff Operations Only (POS, KDS, Admin).
* (Default if unset) `NEXT_PUBLIC_APP_PORTAL=all` — Legacy unified mode (hash-based routing).

---

## 🌐 Deploying to Vercel (Step-by-Step)

To deploy both portals securely, you must create **two separate projects** on Vercel pointing to this same Git repository.

### Project 1: Public Customer Storefront (e.g. `thetaste.co.in`)

1. Go to your **Vercel Dashboard** and click **Add New** > **Project**.
2. Import your restaurant repository.
3. Name the project `the-taste-storefront` (or similar).
4. Expand **Environment Variables** and add:
   * **Key**: `NEXT_PUBLIC_APP_PORTAL`
   * **Value**: `customer`
5. Click **Deploy**.
6. (Optional) Under **Project Settings** > **Domains**, assign your public domain name.

### Project 2: Staff POS & Operations (e.g. `pos.thetaste.co.in`)

1. Go to your **Vercel Dashboard** and click **Add New** > **Project**.
2. Import the **same** repository again.
3. Name the project `the-taste-pos` (or similar).
4. Expand **Environment Variables** and add:
   * **Key**: `NEXT_PUBLIC_APP_PORTAL`
   * **Value**: `pos`
5. Click **Deploy**.
6. (Optional) Under **Project Settings** > **Domains**, assign your private staff subdomain.

---

## 📱 Compiling the Android APK (Staff POS & KDS)

The Capacitor native shell compiles POS assets directly into the Android application.

1. Ensure your local environment has **JDK 21** and **Android SDK** configured.
2. Run the PowerShell builder script:
   ```powershell
   ./build-apk.ps1
   ```
   *Note: This script automatically sets `NEXT_PUBLIC_APP_PORTAL=pos` and runs `npm run build:pos` to generate the secure, staff-only version.*
3. Retrieve the compiled APK at `TheTaste.apk` in the root of this folder.

---

## 💻 Local Development & Testing

Use the following npm scripts during local development:

* **Run Customer Storefront locally**:
  ```bash
  npm run dev:customer
  ```
  *Binds to `http://localhost:3000` (or next free port).*

* **Run POS Console locally**:
  ```bash
  npm run dev:pos
  ```
  *Binds to `http://localhost:3000` (or next free port).*

* **Verify all unit tests**:
  ```bash
  npm run test
  ```
