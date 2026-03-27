# Smart Attendance & Academic Management System (SAAME)

![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)
![Build](https://img.shields.io/badge/build-passing-brightgreen.svg)

A comprehensive, AI-enhanced SaaS platform designed for modern academic institutions to manage attendance, track student performance, and automate mentorship workflows.

## 🚀 Key Modules

### 1. Non-Teaching / Admin Portal
*   **Intelligent Dashboard**: Real-time stats with unique student tracking and attendance rate trends.
*   **Advanced Reports**: One-click generation of Semester/Subject reports with Excel export and print-ready formatting.
*   **Student Management**: Stream-wise organization, active/inactive student tracking, and automated promotion logic.
*   **Mentorship System**: Case-sensitive mentor-mentee mapping and interaction tracking.
*   **WhatsApp Integration**: Direct communication channels for alerts and notifications.

### 2. Teaching / Faculty Portal
*   **AI Assistant**: Powered by Groq AI for instant academic queries (e.g., "How many students are absent from BCA Sem 6 today?").
*   **Digital Attendance**: Mobile-responsive interface for marking attendance in seconds.
*   **Performance Tracking**: Identification of "defaulters" (low attendance) to enable early intervention.

### 3. AI Core
*   **Natural Language Processing**: Advanced intent classification using a layered regex + LLM (Groq) approach.
*   **Deterministic Querying**: High-speed MongoDB query generation for complex academic data retrieval.

---

## 🛠 Tech Stack

*   **Frontend**: HTML5, Vanilla CSS3 (Modern Glassmorphism Design), JavaScript (ES6+)
*   **Backend**: Node.js, Express.js
*   **Database**: MongoDB (Atlas)
*   **Authentication**: Firebase Auth (Identity Platform)
*   **AI Engine**: Groq SDK (Llama 3 / Mixtral models)
*   **Deployment**: Linux VPS / PM2 Process Management

---

## ⚙️ Installation & Setup

### Prerequisites
*   Node.js (v18+)
*   MongoDB Instance
*   Firebase Project (for authentication)
*   Groq API Key (for AI features)

### Local Configuration
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/skandaumesh/Saas-edtech.git
    cd Saas-edtech
    ```

2.  **Backend Setup**:
    *   Navigate to `backend/` and install dependencies: `npm install`
    *   Create a `.env` file in `backend/` with the following variables:
        ```env
        PORT=5000
        MONGO_URI=your_mongodb_connection_string
        GROQ_API_KEY=your_groq_api_key
        FIREBASE_CONFIG=...
        ```
    *   Place your Firebase `serviceAccountKey.json` in `backend/config/`.

3.  **Frontend Setup**:
    *   Update `non-teaching/js/config.js` and `teaching/js/config.js` to point to your backend API.

4.  **Run Locally**:
    ```bash
    # In the backend directory
    node server.js
    ```

---

## 🌐 Deployment (VPS)

The project includes automated deployment scripts for Linux environments:

1.  **Deploy Backend**: `python deploy_backend.py` (Deploys files and restarts PM2)
2.  **Sync VPS**: `python force_vps_pull.py` (Forcefully pulls latest code from GitHub to VPS)

---

## 📧 Support
For technical support or institutional customization, please contact the development lead.

---
*© 2024 Skanda Umesh. All rights reserved.*
