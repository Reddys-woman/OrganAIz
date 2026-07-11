-> OrganAIz — Capture Everything. Forget Nothing.

OrganAIz is an AI-powered memory organizer. Upload a screenshot, a PDF, a voice
note, or a document, and OrganAIz automatically titles it, summarizes it,
tags it, sorts it into a collection, and flags any deadlines hiding inside
it, and gives smart AI recommendations — all on a free tier, from the very first upload.

Built at Hackathon 2026 by Team Code Catalyst.

🔗 Live demo: add your deployed link here
📄 OrganAIz Market Report: [OrganAIz-Competitive-Landscape-Report (1).pdf](https://github.com/user-attachments/files/29925805/OrganAIz-Competitive-Landscape-Report.1.pdf)



✨ OrganAIz Features


AI-powered auto-organization — Google Gemini reads every upload and
generates a human-readable title, a quick summary, relevant tags, and a
collection — no manual filing.

Deadline/Dates detection — automatically pulls due dates, exam dates, and
appointments out of screenshots and documents and surfaces them as
reminders.

Smart search — search by title, summary, tags, collection, file
type/format, or even natural dates like "yesterday" or "this week."

Real file previews — images, inline-playable audio, and click-to-preview
PDFs, right on the card.

Collections that make sense — the AI reuses your existing collections
instead of creating duplicates, and you can create, rename into, or delete
a collection any time.

Trash & Restore — deleted memories sit safely in Trash until you
restore them or empty it, with one-click "Restore All" / "Empty Trash."
Daily streak tracking — counts consecutive days you've actually saved
something.

Storage meter — real usage tracked against a 10 GB cap.

AI Recommendations — flags possible duplicates, upcoming deadlines, and
suggests new collections based on your patterns.

Light & dark mode, fully responsive dashboard.



🧱 Tech Stack

Frontend: HTML, CSS, vanilla JavaScript
Backend: Node.js, Express
Database/Auth: Supabase (PostgreSQL + Auth)
AI: Google Gemini API (@google/generative-ai)
Libraries and other: PDF.js (Mozilla), Three.js, Font Awesome, Multer.


📂 Project Structure

OrganAIz/
├── Frontend/           # Main pages (HTML/CSS/JS)
│   ├── index.html       # Marketing/landing page
│   ├── dashboard.html   # Main app
│   ├── script.js        # Dashboard logic
│   ├── landing.js
│   └── style.css / landing.css
├── backend/             # Express API server
│   ├── server.js        # Routes (upload, memories, trash, collections...)
│   ├── gemini.js         # AI analysis (title/summary/tags/collection/deadline)
│   ├── supabase.js       # Database access layer
│   └── package.json
└── package-lock.json


🚀 Getting Started

1. Clone the repo

bash:
git clone https://github.com/Reddys-woman/OrganAIz.git
cd OrganAIz

2. Set up the backend

bash:
cd backend
npm install

Create a .env file inside backend/

.env:
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_key

Your Supabase memories table needs at least these columns mentioned below.

sql:
create table memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  filename text,
  title text,
  summary text,
  tags text[],
  collection text,
  deadline date,
  file_size bigint,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

Start the server using-

bash:
node server.js

The backend runs on http://localhost:5000 by default.

3. Run the frontend

The frontend is static — open Frontend/index.html directly in your browser,
or serve the folder with any static server, e.g.:

bash:
cd Frontend
npx serve .


👩‍💻 Team Code Catalyst

Shruti Sharma — Founder & Lead Frontend Developer from Delhi, India.
Neural Whirl — Founder & Lead Backend Developer from India.
Prakamya Pandey — Social Media Manager from India.

📸 Instagram: https://www.instagram.com/_.codecatalyst._/


🗺️ Future Roadmap:


 Video support.
 Cross-format linking between related memories.
 Mobile app.
 Project to Product.


📄 License: MIT
