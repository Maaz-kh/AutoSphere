# AutoSphere

**AI-Based Vehicle Management & Auction Platform**

AutoSphere is a full-stack Final Year Project (FYP) platform built for the Pakistani automotive market. It brings together vehicle owners, buyers, and workshops on a single system — combining traditional vehicle and auction management with artificial intelligence and blockchain to make buying, selling, and maintaining vehicles more transparent and data-driven.

The platform helps owners register and manage their vehicles, list them for online auction, get AI-powered price estimates, detect exterior damage from photos, and maintain a verifiable service history. Buyers can browse and bid on live auctions, while workshops can manage appointments, inventory, and service records for the vehicles they work on.

---

## Project Overview

AutoSphere is organized into six integrated modules:

| Module | Description |
|---|---|
| **Frontend** | React-based web application with role-specific dashboards for owners, buyers, workshops, and administrators |
| **Backend** | Node.js / Express REST API with MySQL, authentication, auctions, workshops, and transactions |
| **Vehicle Valuation** | Machine learning service that predicts used car prices for the Pakistani market using an XGBoost + LightGBM ensemble |
| **Vehicle Damage Detection** | Computer vision service using a trained YOLOv10m model with multi-view fusion to detect and deduplicate vehicle damage |
| **Blockchain** | Ethereum smart contract (`ServiceHistoryJSON`) and API for storing tamper-resistant vehicle service records on-chain |
| **Shared Services** | Cloudinary for media uploads, email notifications, and scheduled auction processing |

The system is designed around real-world Pakistani market dynamics — pricing in PKR, local vehicle makes/models/variants, city-based adjustments, and condition categories commonly used in local listings.

---

## User Roles

AutoSphere supports four distinct user types, each with a dedicated experience:

- **Vehicle Owner** — Registers vehicles, creates auctions, tracks bids, books workshop appointments, and uses AI valuation and damage detection tools
- **Buyer** — Browses live auctions, places bids, tracks bidding activity, and explores workshops
- **Workshop** — Manages parts inventory, records services performed on vehicles, lists offered services, and handles customer appointments
- **Administrator** — Oversees platform users, vehicles, workshops, and reports (admin dashboard)

---

## Features

### Authentication & User Management

- Multi-role registration (Vehicle Owner, Buyer, Workshop)
- Secure login with JWT-based session handling
- Email verification for new accounts
- User profile management with role-specific fields
- Workshop onboarding with location, services, and business details
- Terms and conditions acceptance during registration
- Account lockout protection against repeated failed login attempts

### Vehicle Management

- Register vehicles with make, model, variant, year, and specifications
- Cascading vehicle selection (make → model → variant) aligned with Pakistani market data
- Upload and store vehicle images and registration documents
- View and manage all owned vehicles from a personal dashboard
- Detailed vehicle profile pages with full specification and media history
- Vehicle eligibility checks before auction listing (documents, images, ownership)

### AI Vehicle Valuation

- Predict used car market prices tailored to the Pakistani automotive market
- Reference-based depreciation model: latest variant price adjusted by predicted depreciation rate
- XGBoost + LightGBM ensemble for depreciation prediction
- Variant-specific accuracy (e.g. Corolla XLI vs. Altis Grande treated differently)
- Considers age, mileage, exterior condition, transmission, assembly (local/imported), engine capacity, body type, color, and registration city
- Price range visualization and confidence context for owners deciding on auction starting bids
- RESTful FastAPI inference service integrated into the owner dashboard

### AI Vehicle Damage Detection

- Detect exterior vehicle damage from uploaded photos using a custom-trained YOLOv10m model
- **Multi-view fusion** — intelligently matches the same damage across multiple angles so it is not counted twice
- CNN, color histogram, and texture features used for cross-image damage matching
- Consolidated damage report with severity assessment per detected issue
- Repair cost estimation in PKR for the Pakistani market
- Support for multiple damage categories (dents, scratches, cracks, broken parts, etc.)
- Helps owners document vehicle condition before listing for auction

### Online Vehicle Auctions

- Create auction listings linked to registered vehicles
- Set starting bid, optional reserve price, and auction duration (3, 5, 7, or 10 days)
- Upload 5–10 auction photos via Cloudinary
- Draft and publish workflow for auction listings
- Browse active auctions with sorting (newest, ending soon, bid amount, most bids)
- Place bids with enforced minimum bid increments (PKR 5,000 steps)
- Real-time high-bid and bidder tracking
- Automatic auction closure via scheduled background job when duration ends
- Reserve price logic — sale completes only when reserve is met
- Post-auction transaction creation and outcome handling (sold, reserve not met, no bids)
- Email notifications for auction events
- My Auctions dashboard for sellers; My Bids dashboard for active bidders
- Dedicated transaction page for completed auction outcomes

### Workshop & Service Management

- Public workshop directory — owners and buyers can browse registered workshops
- Workshop profile pages with location (Google Maps integration), contact details, and offered services
- Book and manage appointments between vehicle owners and workshops
- Workshops record services performed on vehicles (parts used, labor, costs, notes)
- Service history timeline visible to vehicle owners
- Workshop parts inventory management
- Configure and manage the list of services offered with price ranges
- Appointment management dashboards for both owners and workshops

### Blockchain Service History

- Vehicle service records stored on the Ethereum blockchain (Sepolia testnet)
- `ServiceHistoryJSON` smart contract stores full service report JSON on-chain per vehicle
- Tamper-resistant, timestamped service history linked to vehicle IDs
- Retrieve all service record IDs and full record data for any vehicle
- Blockchain API server bridges the web platform and the on-chain contract
- Adds trust and transparency to a vehicle's maintenance history for buyers and sellers

### Platform & Admin

- Role-based navigation and protected routes per user type
- Responsive dashboard UI with unified branding across all modules
- Admin dashboard for platform oversight (users, vehicles, workshops, reports)
- RESTful API architecture connecting frontend, backend, and all microservices
- Modular microservice design — valuation, damage detection, and blockchain run as separate services

---

*AutoSphere — Making vehicle ownership, valuation, and trading smarter for Pakistan.*
